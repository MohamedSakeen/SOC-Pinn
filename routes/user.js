const express = require('express');
const { db } = require('../config/firebase');
const { collection, doc, getDoc, setDoc, updateDoc, query, where, getDocs } = require('firebase/firestore');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);
router.use(roleMiddleware('user'));

// Scoring constants
const FIRST_BLOOD_SCORE = 45;
const STANDARD_SCORE = 30;
const WRONG_ANSWER_PENALTY = -5;

// Get dashboard - returns all 6 PS with team's progress
router.get('/dashboard', async (req, res) => {
  try {
    const teamDocRef = doc(db, 'teams', req.user.id);
    const teamDoc = await getDoc(teamDocRef);

    if (!teamDoc.exists()) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const team = teamDoc.data();

    // Get all problem statements (just titles and numbers)
    const psRef = collection(db, 'problemStatements');
    const psSnapshot = await getDocs(psRef);

    const problemStatements = psSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        psNumber: data.psNumber,
        title: data.title,
        totalQuestions: data.questions?.length || 12,
        severity: data.severity || null
      };
    }).sort((a, b) => a.psNumber - b.psNumber);

    // Calculate progress for each PS
    const psProgress = problemStatements.map(ps => {
      const psScore = team.scores?.psScores?.[ps.psNumber];
      let completedQuestions = 0;
      let psTotal = 0;

      if (psScore?.questions) {
        Object.values(psScore.questions).forEach(q => {
          if (q.isCompleted) completedQuestions++;
          psTotal += q.score || 0;
        });
      }

      return {
        ...ps,
        completedQuestions,
        score: psTotal
      };
    });

    res.json({
      teamName: team.teamName,
      totalScore: team.scores?.totalScore || 0,
      problemStatements: psProgress
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get specific problem statement with all questions (without answers)
router.get('/ps/:number', async (req, res) => {
  try {
    const psNumber = parseInt(req.params.number);

    if (psNumber < 1 || psNumber > 6) {
      return res.status(400).json({ message: 'Invalid problem statement number' });
    }

    // Check if PS access is allowed
    const settingsRef = doc(db, 'settings', 'global');
    const settingsDoc = await getDoc(settingsRef);

    if (!settingsDoc.exists() || !settingsDoc.data().allowPSAccess) {
      return res.status(403).json({ message: 'Challenge has not started yet. Please wait for admin to begin the event.' });
    }

    // Get team data for progress
    const teamDocRef = doc(db, 'teams', req.user.id);
    const teamDoc = await getDoc(teamDocRef);

    if (!teamDoc.exists()) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const team = teamDoc.data();
    const psScores = team.scores?.psScores?.[psNumber];

    // Get PS details
    const psDocRef = doc(db, 'problemStatements', `ps${String(psNumber).padStart(2, '0')}`);
    const psDoc = await getDoc(psDocRef);

    if (!psDoc.exists()) {
      return res.status(404).json({ message: 'Problem statement not found' });
    }

    const ps = psDoc.data();

    // Remove answers from questions before sending
    const questionsWithProgress = ps.questions.map((q, index) => {
      const questionProgress = psScores?.questions?.[index] || {
        isCompleted: false,
        score: 0,
        attempts: 0,
        completedAt: null,
        isFirstBlood: false
      };

      return {
        index,
        question: q.question,
        hint: q.hint,
        placeholder: q.placeholder,
        isCompleted: questionProgress.isCompleted,
        score: questionProgress.score,
        attempts: questionProgress.attempts,
        completedAt: questionProgress.completedAt,
        isFirstBlood: questionProgress.isFirstBlood
      };
    });

    res.json({
      psNumber: ps.psNumber,
      title: ps.title,
      description: ps.description,
      link: ps.link || null,
      questions: questionsWithProgress,
      totalScore: psScores?.totalScore || 0
    });
  } catch (error) {
    console.error('PS fetch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Check answer for a specific question
router.post('/ps/:number/check/:questionIndex', async (req, res) => {
  try {
    const psNumber = parseInt(req.params.number);
    const questionIndex = parseInt(req.params.questionIndex);
    const { answer } = req.body;

    if (psNumber < 1 || psNumber > 6) {
      return res.status(400).json({ message: 'Invalid problem statement number' });
    }

    if (questionIndex < 0 || questionIndex > 11) {
      return res.status(400).json({ message: 'Invalid question index' });
    }

    // Check if PS access is allowed
    const settingsRef = doc(db, 'settings', 'global');
    const settingsDoc = await getDoc(settingsRef);

    if (!settingsDoc.exists() || !settingsDoc.data().allowPSAccess) {
      return res.status(403).json({ message: 'Challenge has not started yet. Please wait for admin to begin the event.' });
    }

    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({ message: 'Answer is required' });
    }

    // Limit answer length
    if (answer.length > 1000) {
      return res.status(400).json({ message: 'Answer too long' });
    }

    // Get team data
    const teamDocRef = doc(db, 'teams', req.user.id);
    const teamDoc = await getDoc(teamDocRef);

    if (!teamDoc.exists()) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const team = teamDoc.data();

    // Check if already completed
    const questionProgress = team.scores?.psScores?.[psNumber]?.questions?.[questionIndex];
    if (questionProgress?.isCompleted) {
      return res.status(400).json({ message: 'Question already completed' });
    }

    // Get the correct answer
    const psDocRef = doc(db, 'problemStatements', `ps${String(psNumber).padStart(2, '0')}`);
    const psDoc = await getDoc(psDocRef);

    if (!psDoc.exists()) {
      return res.status(404).json({ message: 'Problem statement not found' });
    }

    const ps = psDoc.data();
    const question = ps.questions[questionIndex];
    const hashedAnswer = question.answer; // This is now a bcrypt hash

    // Normalize the user's answer for comparison
    // If case insensitive, lowercase before comparing (matches how we hashed it)
    let userAnswer = answer.trim();
    if (question.isCaseSensitive === false) {
      userAnswer = userAnswer.toLowerCase();
    }

    // Compare user answer with hashed answer using bcrypt
    const isCorrect = await bcrypt.compare(userAnswer, hashedAnswer);

    // Initialize scores structure if needed
    let scores = team.scores || {
      totalScore: 0,
      psScores: {}
    };

    if (!scores.psScores[psNumber]) {
      scores.psScores[psNumber] = {
        questions: {},
        totalScore: 0
      };
    }

    if (!scores.psScores[psNumber].questions[questionIndex]) {
      scores.psScores[psNumber].questions[questionIndex] = {
        isCompleted: false,
        score: 0,
        attempts: 0,
        completedAt: null,
        isFirstBlood: false
      };
    }

    const currentQuestion = scores.psScores[psNumber].questions[questionIndex];
    currentQuestion.attempts += 1;

    let scoreChange = 0;
    let isFirstBlood = false;

    if (isCorrect) {
      // Check for first blood
      const firstBloodRef = doc(db, 'firstBloods', `ps${String(psNumber).padStart(2, '0')}`);
      const firstBloodDoc = await getDoc(firstBloodRef);
      const firstBloodData = firstBloodDoc.data();

      if (!firstBloodData?.questions?.[questionIndex]?.claimedBy) {
        // First blood!
        isFirstBlood = true;
        scoreChange = FIRST_BLOOD_SCORE;

        // Update first blood record
        await updateDoc(firstBloodRef, {
          [`questions.${questionIndex}`]: {
            claimedBy: team.teamName,
            claimedAt: new Date().toISOString()
          }
        });
      } else {
        // Standard score
        scoreChange = STANDARD_SCORE;
      }

      currentQuestion.isCompleted = true;
      currentQuestion.score = scoreChange;
      currentQuestion.completedAt = new Date().toISOString();
      currentQuestion.isFirstBlood = isFirstBlood;

      // Update PS total score
      scores.psScores[psNumber].totalScore += scoreChange;

      // Update overall total score
      scores.totalScore += scoreChange;

    } else {
      // Wrong answer penalty
      scoreChange = WRONG_ANSWER_PENALTY;
      currentQuestion.score += scoreChange;
      scores.psScores[psNumber].totalScore += scoreChange;
      scores.totalScore += scoreChange;
    }

    // Save updated scores
    await updateDoc(teamDocRef, { scores });

    res.json({
      isCorrect,
      scoreChange,
      isFirstBlood,
      totalScore: scores.totalScore,
      psScore: scores.psScores[psNumber].totalScore,
      attempts: currentQuestion.attempts,
      message: isCorrect
        ? 'Solved!'
        : `Wrong answer`
    });

  } catch (error) {
    console.error('Answer check error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const teamsRef = collection(db, 'teams');
    const teamsSnapshot = await getDocs(teamsRef);

    const leaderboard = teamsSnapshot.docs
      .map(doc => {
        const data = doc.data();
        if (data.role === 'admin') return null;

        // Count completed questions
        let totalCompleted = 0;
        let totalFirstBloods = 0;

        if (data.scores?.psScores) {
          Object.values(data.scores.psScores).forEach(ps => {
            if (ps.questions) {
              Object.values(ps.questions).forEach(q => {
                if (q.isCompleted) totalCompleted++;
                if (q.isFirstBlood) totalFirstBloods++;
              });
            }
          });
        }

        return {
          teamName: data.teamName,
          totalScore: data.scores?.totalScore || 0,
          completedQuestions: totalCompleted,
          firstBloods: totalFirstBloods
        };
      })
      .filter(t => t !== null)
      .sort((a, b) => b.totalScore - a.totalScore);

    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get settings (for checking if results are visible)
router.get('/settings', async (req, res) => {
  try {
    const settingsRef = doc(db, 'settings', 'global');
    const settingsDoc = await getDoc(settingsRef);

    if (!settingsDoc.exists()) {
      return res.json({ showResultsToUsers: false, allowPSAccess: false });
    }

    const data = settingsDoc.data();
    res.json({
      showResultsToUsers: data.showResultsToUsers || false,
      allowPSAccess: data.allowPSAccess || false
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get scoreboard (only if enabled by admin)
router.get('/scoreboard', async (req, res) => {
  try {
    // Check if results are visible to users
    const settingsRef = doc(db, 'settings', 'global');
    const settingsDoc = await getDoc(settingsRef);

    if (!settingsDoc.exists() || !settingsDoc.data().showResultsToUsers) {
      return res.status(403).json({ message: 'Scoreboard is not available yet. Please wait for admin to enable it.' });
    }

    const teamsRef = collection(db, 'teams');
    const q = query(teamsRef, where('role', '==', 'user'));
    const teamsSnapshot = await getDocs(q);

    const scoreboard = [];
    teamsSnapshot.forEach(docSnap => {
      const team = docSnap.data();

      // Count completed questions and first bloods
      let totalCompleted = 0;
      let totalFirstBloods = 0;

      if (team.scores?.psScores) {
        Object.values(team.scores.psScores).forEach(ps => {
          if (ps.questions) {
            Object.values(ps.questions).forEach(q => {
              if (q.isCompleted) totalCompleted++;
              if (q.isFirstBlood) totalFirstBloods++;
            });
          }
        });
      }

      scoreboard.push({
        teamId: docSnap.id,
        teamName: team.teamName,
        teamMembers: team.teamMembers,
        totalScore: team.scores?.totalScore || 0,
        completedQuestions: totalCompleted,
        firstBloods: totalFirstBloods
      });
    });

    // Sort by total score descending
    scoreboard.sort((a, b) => b.totalScore - a.totalScore);

    res.json(scoreboard);
  } catch (error) {
    console.error('User scoreboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get score timeline (only if enabled by admin)
router.get('/score-timeline', async (req, res) => {
  try {
    // Check if results are visible to users
    const settingsRef = doc(db, 'settings', 'global');
    const settingsDoc = await getDoc(settingsRef);

    if (!settingsDoc.exists() || !settingsDoc.data().showResultsToUsers) {
      return res.status(403).json({ message: 'Timeline is not available yet. Please wait for admin to enable it.' });
    }

    const teamsRef = collection(db, 'teams');
    const q = query(teamsRef, where('role', '==', 'user'));
    const teamsSnapshot = await getDocs(q);

    const teamsTimeline = [];

    teamsSnapshot.forEach(docSnap => {
      const team = docSnap.data();
      const scoreHistory = [];

      // Collect all score events with timestamps
      if (team.scores?.psScores) {
        Object.entries(team.scores.psScores).forEach(([psNum, ps]) => {
          if (ps.questions) {
            Object.entries(ps.questions).forEach(([qNum, q]) => {
              if (q.isCompleted && q.completedAt) {
                scoreHistory.push({
                  timestamp: q.completedAt,
                  score: q.score || 0,
                  psNumber: parseInt(psNum),
                  questionIndex: parseInt(qNum)
                });
              }
            });
          }
        });
      }

      // Sort by timestamp
      scoreHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Calculate cumulative scores
      let cumulativeScore = 0;
      const timeline = scoreHistory.map(event => {
        cumulativeScore += event.score;
        return {
          timestamp: event.timestamp,
          score: cumulativeScore,
          psNumber: event.psNumber,
          questionIndex: event.questionIndex
        };
      });

      // Add starting point at 0
      if (timeline.length > 0) {
        timeline.unshift({
          timestamp: new Date(new Date(timeline[0].timestamp).getTime() - 1000).toISOString(),
          score: 0
        });
      }

      teamsTimeline.push({
        teamId: docSnap.id,
        teamName: team.teamName,
        timeline
      });
    });

    // Sort teams by final score descending
    teamsTimeline.sort((a, b) => {
      const aFinal = a.timeline.length > 0 ? a.timeline[a.timeline.length - 1].score : 0;
      const bFinal = b.timeline.length > 0 ? b.timeline[b.timeline.length - 1].score : 0;
      return bFinal - aFinal;
    });

    res.json(teamsTimeline);
  } catch (error) {
    console.error('User timeline error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
