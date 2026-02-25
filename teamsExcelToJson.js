const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Excel to JSON Converter for Teams/Users
 * 
 * Excel Format Expected (single sheet):
 * - Column A: teamName
 * - Column B: username
 * - Column C: teamMembers (comma-separated list)
 * - Column D: password (plain text - will be hashed when pushing to Firebase)
 * - Column E: role (user/admin)
 * 
 * Output: JSON file with teams array
 */

// Configuration
const EXCEL_FILE = 'Login_creds.xlsx'; // Change this to your Excel file name
const OUTPUT_FILE = 'teams.json';

function convertTeamsExcelToJson(excelPath, outputPath) {
  try {
    // Read the Excel file
    const workbook = XLSX.readFile(excelPath, {
      raw: false,
      defval: ''
    });

    console.log(`Found ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    console.log(`\nProcessing Sheet: ${sheetName}`);

    const worksheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON (with header row)
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: ''
    });

    if (rawData.length < 2) {
      console.log('No data found in sheet');
      return [];
    }

    // Get headers (first row) - to understand column mapping
    const headers = rawData[0].map(h => String(h).toLowerCase().trim());
    console.log(`Headers: ${rawData[0].join(', ')}`);

    // Find column indices based on headers
    const colIndex = {
      teamName: headers.findIndex(h => h.includes('teamname') || h.includes('team name') || h === 'team'),
      username: headers.findIndex(h => h.includes('username') || h.includes('user')),
      teamMembers: headers.findIndex(h => h.includes('member')),
      password: headers.findIndex(h => h.includes('password') || h.includes('pass')),
      role: headers.findIndex(h => h.includes('role'))
    };

    // Default to positional if not found
    if (colIndex.teamName === -1) colIndex.teamName = 0;
    if (colIndex.username === -1) colIndex.username = 1;
    if (colIndex.teamMembers === -1) colIndex.teamMembers = 2;
    if (colIndex.password === -1) colIndex.password = 3;
    if (colIndex.role === -1) colIndex.role = 4;

    console.log(`Column mapping: teamName=${colIndex.teamName}, username=${colIndex.username}, members=${colIndex.teamMembers}, password=${colIndex.password}, role=${colIndex.role}`);

    const teams = [];

    // Process rows (skip header)
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];

      // Skip empty rows
      if (!row || row.length === 0) {
        continue;
      }

      const teamName = String(row[colIndex.teamName] || '').trim();
      const username = String(row[colIndex.username] || '').trim();
      const teamMembersStr = String(row[colIndex.teamMembers] || '').trim();
      const password = String(row[colIndex.password] || '').trim();
      const role = String(row[colIndex.role] || 'user').trim().toLowerCase();

      // Parse team members (comma-separated)
      let teamMembers = [];
      if (teamMembersStr) {
        teamMembers = teamMembersStr.split(',').map(m => m.trim()).filter(m => m);
      }

      if (username && password) {
        const teamObj = {
          username: username,
          password: password, // Plain text - will be hashed when pushing
          teamName: teamName || username,
          teamMembers: teamMembers,
          role: role === 'admin' ? 'admin' : 'user'
        };

        teams.push(teamObj);
        console.log(`  ${role.toUpperCase()}: ${username} - ${teamName} (${teamMembers.length} members)`);
      }
    }

    // Always add 3 dummy test users at the end
    const dummyTestUsers = [
      {
        username: 'team1',
        password: 'team1pass',
        teamName: 'Test Team 1',
        teamMembers: ['Tester A', 'Tester B'],
        role: 'user'
      },
      {
        username: 'team2',
        password: 'team2pass',
        teamName: 'Test Team 2',
        teamMembers: ['Tester C', 'Tester D'],
        role: 'user'
      },
      {
        username: 'team3',
        password: 'team3pass',
        teamName: 'Test Team 3',
        teamMembers: ['Tester E', 'Tester F'],
        role: 'user'
      }
    ];

    teams.push(...dummyTestUsers);
    console.log('\n  📋 Added 3 dummy test users (team1, team2, team3)');

    // Write to JSON file
    const jsonOutput = JSON.stringify(teams, null, 2);
    fs.writeFileSync(outputPath, jsonOutput, 'utf8');

    console.log(`\n✅ Successfully converted ${teams.length} teams (including 3 test users)`);
    console.log(`📄 Output saved to: ${outputPath}`);

    return teams;

  } catch (error) {
    console.error('❌ Error converting Excel to JSON:', error.message);
    throw error;
  }
}

// Main execution
const dataDir = __dirname;
const excelPath = path.join(dataDir, EXCEL_FILE);
const outputPath = path.join(dataDir, OUTPUT_FILE);

// Check if Excel file exists
if (!fs.existsSync(excelPath)) {
  console.log(`Excel file not found: ${excelPath}`);
  console.log('\nCreating dummy teams.json with test data...\n');

  // Create dummy test data
  const dummyTeams = [
    {
      username: 'team1',
      password: 'team1pass',
      teamName: 'CyberHawks',
      teamMembers: ['Alice', 'Bob', 'Charlie'],
      role: 'user'
    },
    {
      username: 'team2',
      password: 'team2pass',
      teamName: 'SecurityNinjas',
      teamMembers: ['David', 'Eve', 'Frank'],
      role: 'user'
    },
    {
      username: 'team3',
      password: 'team3pass',
      teamName: 'ThreatHunters',
      teamMembers: ['Grace', 'Henry', 'Ivy'],
      role: 'user'
    },
    {
      username: 'admin',
      password: 'admin123',
      teamName: 'Admin',
      teamMembers: [],
      role: 'admin'
    }
  ];

  fs.writeFileSync(outputPath, JSON.stringify(dummyTeams, null, 2), 'utf8');
  console.log('✅ Created dummy teams.json with 3 test teams + 1 admin');
  console.log('\nDummy credentials:');
  dummyTeams.forEach(t => {
    console.log(`   ${t.username} / ${t.password} (${t.role})`);
  });

} else {
  console.log('='.repeat(60));
  console.log('Excel to JSON Converter for Teams');
  console.log('='.repeat(60));
  console.log(`\nInput: ${excelPath}`);
  console.log(`Output: ${outputPath}`);

  convertTeamsExcelToJson(excelPath, outputPath);

  console.log('\n' + '='.repeat(60));
  console.log('Conversion complete!');
  console.log('='.repeat(60));
}
