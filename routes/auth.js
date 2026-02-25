const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');
const {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp
} = require('firebase/firestore');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password, teamName, email, teamMembers } = req.body;

    // --- Validation ---
    if (!username || !password || !teamName || !email) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // --- Check for duplicate username ---
    const teamsRef = collection(db, 'teams');
    const existingQ = query(teamsRef, where('username', '==', username.trim()));
    const existingSnapshot = await getDocs(existingQ);

    if (!existingSnapshot.empty) {
      return res.status(409).json({ message: 'Team name already taken. Choose another.' });
    }

    // --- Normalise teamMembers (array from frontend, filter empty slots) ---
    const membersArray = Array.isArray(teamMembers)
      ? teamMembers.map((m) => m.trim()).filter((m) => m.length > 0)
      : [];

    // --- Hash password ---
    const hashedPassword = await bcrypt.hash(password, 12);

    // --- Initialize score structure (6 PS, 12 questions each) ---
    const scoreData = {
      totalScore: 0,
      psScores: {}
    };

    for (let psNum = 1; psNum <= 6; psNum++) {
      scoreData.psScores[psNum] = {
        questions: {},
        totalScore: 0
      };

      for (let q = 0; q < 12; q++) {
        scoreData.psScores[psNum].questions[q] = {
          isCompleted: false,
          score: 0,
          attempts: 0,
          completedAt: null,
          isFirstBlood: false
        };
      }
    }

    // --- Save to Firestore using username as ID ---
    const teamDocData = {
      username: username.trim(),
      teamName: teamName.trim(),
      email: email.trim(),
      teamMembers: membersArray,
      password: hashedPassword,
      role: 'user',
      scores: scoreData,
      solvedChallenges: [], // Legacy field
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, 'teams', username.trim()), teamDocData);

    // --- Issue JWT ---
    const token = jwt.sign(
      { id: username.trim(), username: username.trim(), role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Enlistment successful. Welcome, operative.',
      token,
      user: {
        id: username.trim(),
        username: username.trim(),
        teamName: teamName.trim(),
        role: 'user'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get team by username
    const teamsRef = collection(db, 'teams');
    const q = query(teamsRef, where('username', '==', username));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const teamDoc = snapshot.docs[0];
    const team = teamDoc.data();

    // Verify password
    const isValid = await bcrypt.compare(password, team.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT with expiration
    const token = jwt.sign(
      { id: teamDoc.id, username: team.username, role: team.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: teamDoc.id,
        username: team.username,
        teamName: team.teamName,
        role: team.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Diagnostic endpoint (Check if Env Vars are set)
router.get('/diag', (req, res) => {
  res.json({
    firebase: !!process.env.FIREBASE_API_KEY,
    jwt: !!process.env.JWT_SECRET,
    project: process.env.FIREBASE_PROJECT_ID || 'missing'
  });
});

module.exports = router;
