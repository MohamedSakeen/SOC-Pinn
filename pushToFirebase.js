const { db } = require('./config/firebase');
const { collection, doc, setDoc, getDocs, deleteDoc } = require('firebase/firestore');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

/**
 * Push Problem Statements and Teams JSON to Firebase
 * 
 * This script reads the problemStatements.json and teams.json files from the data folder
 * and pushes all data to Firebase Firestore.
 * It clears existing problem statements, first bloods, and teams before inserting new data.
 * 
 * Usage: node pushToFirebase.js [--teams-only] [--ps-only]
 */

const PS_JSON_FILE = path.join(__dirname, 'data', 'problemStatements.json');
const TEAMS_JSON_FILE = path.join(__dirname, 'data', 'teams.json');

async function pushProblemStatements(problemStatements) {
  // Clear existing problem statements
  console.log('🗑️  Clearing existing problem statements...');
  const psRef = collection(db, 'problemStatements');
  const psSnapshot = await getDocs(psRef);
  for (const docSnap of psSnapshot.docs) {
    await deleteDoc(doc(db, 'problemStatements', docSnap.id));
  }
  console.log(`   Deleted ${psSnapshot.docs.length} existing problem statements`);

  // Clear existing firstBloods
  console.log('🗑️  Clearing existing first bloods...');
  const fbRef = collection(db, 'firstBloods');
  const fbSnapshot = await getDocs(fbRef);
  for (const docSnap of fbSnapshot.docs) {
    await deleteDoc(doc(db, 'firstBloods', docSnap.id));
  }
  console.log(`   Deleted ${fbSnapshot.docs.length} existing first blood records`);

  // Seed problem statements with HASHED answers
  console.log('\n📝 Pushing problem statements (hashing answers)...');
  for (const ps of problemStatements) {
    // Hash all answers before pushing to Firestore
    const psWithHashedAnswers = {
      ...ps,
      questions: await Promise.all(ps.questions.map(async (q) => {
        // Normalize answer for consistent hashing
        let answerToHash = q.answer.trim();
        // If case insensitive, lowercase before hashing
        if (q.isCaseSensitive === false) {
          answerToHash = answerToHash.toLowerCase();
        }
        const hashedAnswer = await bcrypt.hash(answerToHash, 10);
        return {
          ...q,
          answer: hashedAnswer // Store hashed answer
        };
      }))
    };

    await setDoc(doc(db, 'problemStatements', `ps${ps.psNumber}`), psWithHashedAnswers);
    console.log(`   ✅ PS ${ps.psNumber}: ${ps.title} (${ps.severity}) - answers hashed 🔐`);
  }

  // Initialize first bloods for each PS and question
  console.log('\n🏆 Initializing first blood tracking...');
  for (const ps of problemStatements) {
    const firstBloodData = {
      psNumber: ps.psNumber,
      questions: {}
    };

    // Initialize each question's first blood as null
    for (let i = 0; i < ps.questions.length; i++) {
      firstBloodData.questions[i] = {
        claimedBy: null,
        claimedAt: null
      };
    }

    await setDoc(doc(db, 'firstBloods', `ps${ps.psNumber}`), firstBloodData);
    console.log(`   ✅ First blood tracking for PS ${ps.psNumber} (${ps.questions.length} questions)`);
  }

  return problemStatements;
}

async function pushTeams(teams, numPS = 6, questionsPerPS = 12) {
  // Clear existing teams
  console.log('\n🗑️  Clearing existing teams...');
  const teamsRef = collection(db, 'teams');
  const teamsSnapshot = await getDocs(teamsRef);
  for (const docSnap of teamsSnapshot.docs) {
    await deleteDoc(doc(db, 'teams', docSnap.id));
  }
  console.log(`   Deleted ${teamsSnapshot.docs.length} existing teams`);

  // Create new teams/users
  console.log('\n👥 Creating teams and users...');
  for (const team of teams) {
    // Hash password
    const hashedPassword = await bcrypt.hash(team.password, 10);

    // Create score structure for non-admin users
    let scoreData = null;
    if (team.role === 'user') {
      scoreData = {
        totalScore: 0,
        psScores: {}
      };

      for (let psNum = 1; psNum <= numPS; psNum++) {
        scoreData.psScores[psNum] = {
          questions: {},
          totalScore: 0
        };

        for (let q = 0; q < questionsPerPS; q++) {
          scoreData.psScores[psNum].questions[q] = {
            isCompleted: false,
            score: 0,
            attempts: 0,
            completedAt: null,
            isFirstBlood: false
          };
        }
      }
    }

    const teamData = {
      username: team.username,
      password: hashedPassword,
      teamName: team.teamName,
      teamMembers: team.teamMembers || [],
      role: team.role,
      createdAt: new Date().toISOString()
    };

    if (scoreData) {
      teamData.scores = scoreData;
    }

    // Use username as document ID for easy lookup
    await setDoc(doc(db, 'teams', team.username), teamData);
    console.log(`   ✅ Created ${team.role}: ${team.teamName} (${team.username})`);
  }

  return teams;
}

async function pushToFirebase() {
  const args = process.argv.slice(2);
  const teamsOnly = args.includes('--teams-only');
  const psOnly = args.includes('--ps-only');

  try {
    console.log('🚀 Starting Firebase push...\n');

    let problemStatements = [];
    let teams = [];

    // Load problem statements JSON
    if (!teamsOnly) {
      if (!fs.existsSync(PS_JSON_FILE)) {
        console.error(`❌ Problem statements JSON file not found: ${PS_JSON_FILE}`);
        console.log('\nPlease run excelToJson.js first to generate the JSON file.');
        if (!psOnly) {
          console.log('Or use --teams-only to only push teams.');
        }
        process.exit(1);
      }
      const psData = fs.readFileSync(PS_JSON_FILE, 'utf8');
      problemStatements = JSON.parse(psData);
      console.log(`📄 Loaded ${problemStatements.length} problem statements from JSON`);
    }

    // Load teams JSON
    if (!psOnly) {
      if (!fs.existsSync(TEAMS_JSON_FILE)) {
        console.error(`❌ Teams JSON file not found: ${TEAMS_JSON_FILE}`);
        console.log('\nPlease run teamsExcelToJson.js first to generate the JSON file.');
        if (!teamsOnly) {
          console.log('Or use --ps-only to only push problem statements.');
        }
        process.exit(1);
      }
      const teamsData = fs.readFileSync(TEAMS_JSON_FILE, 'utf8');
      teams = JSON.parse(teamsData);
      console.log(`📄 Loaded ${teams.length} teams from JSON`);
    }

    console.log('');

    // Push problem statements
    if (!teamsOnly && problemStatements.length > 0) {
      await pushProblemStatements(problemStatements);
    }

    // Push teams
    if (!psOnly && teams.length > 0) {
      const numPS = problemStatements.length || 6;
      const questionsPerPS = problemStatements[0]?.questions?.length || 12;
      await pushTeams(teams, numPS, questionsPerPS);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ Firebase push completed successfully!');
    console.log('='.repeat(60));

    // Summary
    console.log('\nSummary:');

    if (!teamsOnly && problemStatements.length > 0) {
      console.log(`   - ${problemStatements.length} Problem Statements created`);

      let totalQuestions = 0;
      let caseSensitiveCount = 0;

      problemStatements.forEach(ps => {
        totalQuestions += ps.questions.length;
        caseSensitiveCount += ps.questions.filter(q => q.isCaseSensitive).length;
      });

      console.log(`   - ${totalQuestions} Total questions`);
      console.log(`   - ${caseSensitiveCount} Case-sensitive questions`);
      console.log(`   - ${totalQuestions - caseSensitiveCount} Case-insensitive questions`);
      console.log(`   - First blood tracking initialized for all questions`);
    }

    if (!psOnly && teams.length > 0) {
      const userCount = teams.filter(t => t.role === 'user').length;
      const adminCount = teams.filter(t => t.role === 'admin').length;
      console.log(`   - ${userCount} Teams created`);
      console.log(`   - ${adminCount} Admin account(s) created`);

      console.log('\nLogin Credentials:');
      teams.forEach(t => {
        console.log(`   - ${t.username} / ${t.password} (${t.role})`);
      });
    }

    if (!teamsOnly && problemStatements.length > 0) {
      console.log('\nProblem Statements:');
      problemStatements.forEach(ps => {
        console.log(`   PS${ps.psNumber}: ${ps.title} [${ps.severity.toUpperCase()}] - ${ps.questions.length} questions`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error pushing to Firebase:', error);
    process.exit(1);
  }
}

pushToFirebase();
