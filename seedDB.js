const { db } = require('./config/firebase');
const { collection, doc, setDoc, getDocs, deleteDoc } = require('firebase/firestore');
const bcrypt = require('bcryptjs');

// Sample Users/Teams
const sampleTeams = [
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
    username: 'team4',
    password: 'team4pass',
    teamName: 'BlueTeamElite',
    teamMembers: ['Jack', 'Karen', 'Leo'],
    role: 'user'
  },
  {
    username: 'team5',
    password: 'team5pass',
    teamName: 'IncidentSquad',
    teamMembers: ['Mike', 'Nancy', 'Oscar'],
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

// Sample Problem Statements with 12 sub-problems each
const problemStatements = [
  {
    psNumber: 1,
    title: "Network Traffic Analysis",
    severity: "high",
    link: "https://drive.google.com/file/d/example1",
    description: `You are a SOC analyst investigating suspicious network traffic captured from a corporate environment. The packet capture contains evidence of a potential data exfiltration attempt.

Your task is to analyze the provided network logs and answer the following questions to piece together the attack timeline and identify the threat actor's methods.

Key Information:
- Capture Duration: 24 hours (2026-01-20 00:00 to 2026-01-21 00:00)
- Network Segment: Internal corporate network (192.168.1.0/24)
- Suspected compromised host: 192.168.1.105
- External suspicious IP: 45.33.32.156

Artifacts available:
- Network flow logs
- DNS query logs  
- HTTP/HTTPS connection logs
- Firewall logs`,
    questions: [
      {
        question: "What is the MAC address of the suspected compromised host?",
        answer: "00:1A:2B:3C:4D:5E",
        hint: "Look for ARP requests from 192.168.1.105",
        placeholder: "Format: XX:XX:XX:XX:XX:XX",
        isCaseInsensitive: true
      },
      {
        question: "How many DNS queries were made to suspicious domains in the capture?",
        answer: "47",
        hint: "Filter DNS logs for domains not in the corporate whitelist",
        placeholder: "Enter a number"
      },
      {
        question: "What port was used for the C2 communication?",
        answer: "8443",
        hint: "Look for recurring outbound connections to the suspicious IP",
        placeholder: "Enter port number"
      },
      {
        question: "What is the SHA256 hash of the malicious payload downloaded?",
        answer: "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
        hint: "Check HTTP GET requests for executable files",
        placeholder: "64 character hex string",
        isCaseInsensitive: true
      },
      {
        question: "What time (UTC) did the initial compromise occur?",
        answer: "14:32:15",
        hint: "Look for the first connection to the malicious IP",
        placeholder: "Format: HH:MM:SS"
      },
      {
        question: "How many megabytes of data were exfiltrated?",
        answer: "156",
        hint: "Sum the outbound data transfer to suspicious destinations",
        placeholder: "Enter number in MB"
      },
      {
        question: "What was the User-Agent string used by the malware?",
        answer: "Mozilla/5.0 WinBot/3.1",
        hint: "Check HTTP headers for unusual User-Agent strings",
        placeholder: "Enter the exact User-Agent",
        isCaseInsensitive: true
      },
      {
        question: "What protocol was tunneled inside DNS queries?",
        answer: "HTTP",
        hint: "Analyze the DNS TXT record responses",
        placeholder: "Protocol name",
        isCaseInsensitive: true
      },
      {
        question: "How many internal hosts did the attacker scan?",
        answer: "23",
        hint: "Look for port scanning patterns from the compromised host",
        placeholder: "Enter a number"
      },
      {
        question: "What is the domain used for data exfiltration?",
        answer: "exfil.malware-c2.com",
        hint: "Check DNS queries with high frequency",
        placeholder: "Enter domain name",
        isCaseInsensitive: true
      },
      {
        question: "What CVE was exploited for initial access?",
        answer: "CVE-2024-1234",
        hint: "Correlate the attack pattern with known vulnerabilities",
        placeholder: "Format: CVE-XXXX-XXXX",
        isCaseInsensitive: true
      },
      {
        question: "What is the attacker's MITRE ATT&CK technique ID for exfiltration?",
        answer: "T1048",
        hint: "Identify the exfiltration method used",
        placeholder: "Format: TXXXX",
        isCaseInsensitive: true
      }
    ]
  },
  {
    psNumber: 2,
    title: "Malware Analysis Challenge",
    severity: "critical",
    link: "https://drive.google.com/file/d/example2",
    description: `A suspicious executable was found on a user's workstation after they reported unusual system behavior. Your task is to perform static and dynamic analysis to understand the malware's capabilities.

Incident Details:
- File Name: update_service.exe
- File Size: 2.4 MB
- First Seen: 2026-01-22 09:15 UTC
- Affected System: WORKSTATION-042
- User: john.doe@company.com

Behavioral Indicators:
- System slowdown reported
- Unexpected network connections
- New scheduled tasks created
- Registry modifications detected`,
    questions: [
      {
        question: "What is the MD5 hash of the malware sample?",
        answer: "d41d8cd98f00b204e9800998ecf8427e",
        hint: "Use a hashing tool on the executable",
        placeholder: "32 character hex string",
        isCaseInsensitive: true
      },
      {
        question: "What packer was used to obfuscate the executable?",
        answer: "UPX",
        hint: "Check PE headers for packer signatures",
        placeholder: "Packer name",
        isCaseInsensitive: true
      },
      {
        question: "How many API calls to CreateRemoteThread were found?",
        answer: "3",
        hint: "Look for process injection indicators",
        placeholder: "Enter a number"
      },
      {
        question: "What registry key is modified for persistence?",
        answer: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        hint: "Check common persistence locations",
        placeholder: "Full registry path"
      },
      {
        question: "What is the mutex name created by the malware?",
        answer: "Global\\XYZ_MUTEX_2026",
        hint: "Check for mutex creation in API calls",
        placeholder: "Mutex name"
      },
      {
        question: "What encryption algorithm is used for C2 communication?",
        answer: "AES-256",
        hint: "Analyze the crypto-related imports",
        placeholder: "Algorithm name",
        isCaseInsensitive: true
      },
      {
        question: "What scheduled task name does the malware create?",
        answer: "WindowsUpdateService",
        hint: "Check schtasks commands in behavior logs",
        placeholder: "Task name"
      },
      {
        question: "What is the PDB path found in the binary?",
        answer: "C:\\Users\\dev\\malware\\Release\\bot.pdb",
        hint: "Check PE debug information",
        placeholder: "Full file path"
      },
      {
        question: "How many embedded URLs were found in strings?",
        answer: "7",
        hint: "Extract strings and filter for http/https",
        placeholder: "Enter a number"
      },
      {
        question: "What anti-analysis technique is implemented?",
        answer: "VM Detection",
        hint: "Look for checks against common sandbox artifacts",
        placeholder: "Technique name",
        isCaseInsensitive: true
      },
      {
        question: "What is the compile timestamp of the malware?",
        answer: "2026-01-15 08:30:00",
        hint: "Check PE header timestamp",
        placeholder: "Format: YYYY-MM-DD HH:MM:SS"
      },
      {
        question: "What malware family does this sample belong to?",
        answer: "Emotet",
        hint: "Compare behavioral indicators with known families",
        placeholder: "Malware family name",
        isCaseInsensitive: true
      }
    ]
  },
  {
    psNumber: 3,
    title: "Log Analysis Investigation",
    severity: "medium",
    link: "https://drive.google.com/file/d/example3",
    description: `Critical servers have been experiencing authentication failures and suspicious login attempts. You need to analyze the consolidated logs to identify the attack pattern and affected accounts.

Environment:
- Active Directory Domain: corp.company.local
- Domain Controllers: DC01, DC02
- Log Sources: Windows Security Events, Syslog, Apache Access Logs
- Time Range: 2026-01-23 00:00 to 2026-01-24 00:00

Alerts Triggered:
- Multiple failed login attempts
- Account lockouts
- Unusual source IP addresses
- Off-hours access attempts`,
    questions: [
      {
        question: "How many unique source IPs attempted brute force attacks?",
        answer: "156",
        hint: "Filter for Event ID 4625 with multiple attempts",
        placeholder: "Enter a number"
      },
      {
        question: "Which user account had the most failed login attempts?",
        answer: "admin.backup",
        hint: "Sort failed logins by target account",
        placeholder: "Username",
        isCaseInsensitive: true
      },
      {
        question: "What is the top attacking country based on GeoIP?",
        answer: "Russia",
        hint: "Perform GeoIP lookup on source IPs",
        placeholder: "Country name",
        isCaseInsensitive: true
      },
      {
        question: "How many successful logins occurred from suspicious IPs?",
        answer: "12",
        hint: "Cross-reference success events with flagged IPs",
        placeholder: "Enter a number"
      },
      {
        question: "What Windows Event ID indicates Kerberos pre-auth failure?",
        answer: "4771",
        hint: "Check Kerberos-related event IDs",
        placeholder: "Event ID number"
      },
      {
        question: "What time did the attack campaign begin?",
        answer: "02:15:33",
        hint: "Find the first clustered failed attempts",
        placeholder: "Format: HH:MM:SS"
      },
      {
        question: "How many accounts were successfully compromised?",
        answer: "4",
        hint: "Look for successful logins after multiple failures",
        placeholder: "Enter a number"
      },
      {
        question: "What is the attacking botnet's password spray interval?",
        answer: "30",
        hint: "Calculate time between attempts per account",
        placeholder: "Seconds"
      },
      {
        question: "Which domain controller processed most failed authentications?",
        answer: "DC01",
        hint: "Aggregate events by source DC",
        placeholder: "Server name",
        isCaseInsensitive: true
      },
      {
        question: "What user agent was used in the web-based attacks?",
        answer: "python-requests/2.28.0",
        hint: "Check Apache access logs",
        placeholder: "User-Agent string",
        isCaseInsensitive: true
      },
      {
        question: "How many unique passwords were attempted in the spray?",
        answer: "25",
        hint: "This requires correlating with password policy violations",
        placeholder: "Enter a number"
      },
      {
        question: "What lateral movement technique was used post-compromise?",
        answer: "Pass-the-Hash",
        hint: "Check for Event ID 4624 with logon type 3",
        placeholder: "Technique name",
        isCaseInsensitive: true
      }
    ]
  },
  {
    psNumber: 4,
    title: "Phishing Email Analysis",
    severity: "low",
    link: "https://drive.google.com/file/d/example4",
    description: `The security team intercepted a phishing campaign targeting executives. You need to analyze the email headers, attachments, and infrastructure to understand the threat.

Email Details:
- Subject: "Urgent: Q4 Financial Report Review Required"
- Sender (Display): CFO <cfo@company.com>
- Recipients: 15 executive accounts
- Attachment: Q4_Report_2026.xlsm

Observed Indicators:
- Macro-enabled Excel attachment
- Suspicious sender domain
- Urgency tactics used
- External reply-to address`,
    questions: [
      {
        question: "What is the actual sender email domain?",
        answer: "c0mpany-finance.com",
        hint: "Check the Return-Path and envelope sender",
        placeholder: "Domain name",
        isCaseInsensitive: true
      },
      {
        question: "What IP address sent the phishing email?",
        answer: "185.234.72.15",
        hint: "Look at the Received headers from bottom to top",
        placeholder: "IP address"
      },
      {
        question: "What is the reply-to email address?",
        answer: "secure-review@protonmail.com",
        hint: "Check the Reply-To header",
        placeholder: "Email address",
        isCaseInsensitive: true
      },
      {
        question: "What VBA function triggers on document open?",
        answer: "Auto_Open",
        hint: "Extract and analyze the macro code",
        placeholder: "Function name",
        isCaseInsensitive: true
      },
      {
        question: "What PowerShell flag is used to bypass execution policy?",
        answer: "-ExecutionPolicy Bypass",
        hint: "Decode the macro payload",
        placeholder: "PowerShell parameter",
        isCaseInsensitive: true
      },
      {
        question: "What is the payload download URL domain?",
        answer: "cdn-update.malicious-site.com",
        hint: "Analyze the decoded PowerShell command",
        placeholder: "Domain name",
        isCaseInsensitive: true
      },
      {
        question: "What registrar was used for the phishing domain?",
        answer: "NameCheap",
        hint: "Perform WHOIS lookup",
        placeholder: "Registrar name",
        isCaseInsensitive: true
      },
      {
        question: "How many SPF failures were logged?",
        answer: "15",
        hint: "Check email authentication results",
        placeholder: "Enter a number"
      },
      {
        question: "What encoding was used to obfuscate the macro?",
        answer: "Base64",
        hint: "Look at the strings in the macro code",
        placeholder: "Encoding type",
        isCaseInsensitive: true
      },
      {
        question: "What is the DKIM result for the phishing email?",
        answer: "fail",
        hint: "Check Authentication-Results header",
        placeholder: "pass/fail/none"
      },
      {
        question: "When was the phishing domain registered?",
        answer: "2026-01-20",
        hint: "WHOIS creation date",
        placeholder: "Format: YYYY-MM-DD"
      },
      {
        question: "What threat actor group is associated with this TTP?",
        answer: "FIN7",
        hint: "Match techniques with known threat actors",
        placeholder: "Threat actor name",
        isCaseInsensitive: true
      }
    ]
  },
  {
    psNumber: 5,
    title: "Incident Response Scenario",
    severity: "critical",
    link: "https://drive.google.com/file/d/example5",
    description: `A ransomware attack has been detected on the corporate network. Multiple systems are showing signs of encryption and a ransom note has appeared. Your task is to investigate and contain the incident.

Incident Timeline:
- T+0: First encrypted file detected on FILE-SERVER-01
- T+5min: Ransomware spread to 3 additional servers
- T+15min: Backup server targeted
- T+30min: Ransom note displayed on all affected systems

Affected Systems:
- FILE-SERVER-01 (Primary file server)
- DB-SERVER-02 (Database server)
- BACKUP-SVR (Backup infrastructure)
- WEB-APP-01 (Internal application server)`,
    questions: [
      {
        question: "What ransomware family was used in the attack?",
        answer: "LockBit 3.0",
        hint: "Analyze the ransom note format and file extension",
        placeholder: "Ransomware name",
        isCaseInsensitive: true
      },
      {
        question: "What file extension was appended to encrypted files?",
        answer: ".lockbit",
        hint: "Check affected files on the file server",
        placeholder: ".extension",
        isCaseInsensitive: true
      },
      {
        question: "What is the Bitcoin wallet address in the ransom note?",
        answer: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        hint: "Extract from the ransom note",
        placeholder: "BTC address"
      },
      {
        question: "What was the initial access vector?",
        answer: "RDP Brute Force",
        hint: "Check authentication logs before encryption",
        placeholder: "Attack vector",
        isCaseInsensitive: true
      },
      {
        question: "Which user account was compromised for lateral movement?",
        answer: "svc_backup",
        hint: "Check service accounts with admin privileges",
        placeholder: "Username",
        isCaseInsensitive: true
      },
      {
        question: "What tool was used to disable antivirus?",
        answer: "GMER",
        hint: "Check for rootkit/AV killer tools",
        placeholder: "Tool name",
        isCaseInsensitive: true
      },
      {
        question: "How many GB of data was exfiltrated before encryption?",
        answer: "450",
        hint: "Check outbound data transfer logs",
        placeholder: "Number in GB"
      },
      {
        question: "What shadow copy deletion command was used?",
        answer: "vssadmin delete shadows /all /quiet",
        hint: "Check PowerShell and CMD history",
        placeholder: "Full command",
        isCaseInsensitive: true
      },
      {
        question: "What is the Tor onion address for the leak site?",
        answer: "lockbit7z2og4yutm.onion",
        hint: "Found in the ransom note",
        placeholder: ".onion address",
        isCaseInsensitive: true
      },
      {
        question: "How many files were encrypted in total?",
        answer: "1547823",
        hint: "Count files with the ransomware extension",
        placeholder: "Enter a number"
      },
      {
        question: "What persistence mechanism was used?",
        answer: "Scheduled Task",
        hint: "Check startup items and scheduled tasks",
        placeholder: "Mechanism type",
        isCaseInsensitive: true
      },
      {
        question: "What was the demanded ransom amount in USD?",
        answer: "500000",
        hint: "Convert BTC amount from ransom note",
        placeholder: "Dollar amount"
      }
    ]
  },
  {
    psNumber: 6,
    title: "Cloud Security Investigation",
    severity: "high",
    link: "https://drive.google.com/file/d/example6",
    description: `Suspicious activity has been detected in the company's AWS environment. CloudTrail logs show unusual API calls and potential unauthorized access to sensitive S3 buckets.

AWS Environment:
- Account ID: 123456789012
- Region: us-east-1
- Affected Services: S3, IAM, EC2, Lambda
- Time Range: 2026-01-24 00:00 to 2026-01-25 00:00

Alert Summary:
- Unusual S3 bucket enumeration
- New IAM user created
- Security group modifications
- Lambda function deployed from unknown source`,
    questions: [
      {
        question: "What IAM user was compromised initially?",
        answer: "dev-jenkins-ci",
        hint: "Check the source of the first suspicious API call",
        placeholder: "IAM username",
        isCaseInsensitive: true
      },
      {
        question: "What new IAM user was created by the attacker?",
        answer: "admin-backup-svc",
        hint: "Look for CreateUser API calls",
        placeholder: "IAM username",
        isCaseInsensitive: true
      },
      {
        question: "How many S3 buckets were accessed?",
        answer: "23",
        hint: "Count unique bucket names in GetObject/ListBucket calls",
        placeholder: "Enter a number"
      },
      {
        question: "What S3 bucket contained the most sensitive data accessed?",
        answer: "company-financial-reports-prod",
        hint: "Check for buckets with PII or financial data",
        placeholder: "Bucket name",
        isCaseInsensitive: true
      },
      {
        question: "What source IP was used for the attack?",
        answer: "203.0.113.50",
        hint: "Check sourceIPAddress in CloudTrail",
        placeholder: "IP address"
      },
      {
        question: "What EC2 instance type was launched by the attacker?",
        answer: "c5.4xlarge",
        hint: "Check RunInstances API calls",
        placeholder: "Instance type",
        isCaseInsensitive: true
      },
      {
        question: "What region was the malicious EC2 instance launched in?",
        answer: "ap-southeast-1",
        hint: "Attacker often use different regions to avoid detection",
        placeholder: "AWS region"
      },
      {
        question: "What is the name of the malicious Lambda function?",
        answer: "data-sync-backup",
        hint: "Check CreateFunction API calls",
        placeholder: "Function name",
        isCaseInsensitive: true
      },
      {
        question: "What security group rule was added?",
        answer: "0.0.0.0/0:22",
        hint: "Check AuthorizeSecurityGroupIngress calls",
        placeholder: "Format: CIDR:Port"
      },
      {
        question: "How many GB of data was downloaded from S3?",
        answer: "78",
        hint: "Sum the bytes transferred in S3 GET operations",
        placeholder: "Number in GB"
      },
      {
        question: "What access key ID was used in the attack?",
        answer: "AKIAIOSFODNN7EXAMPLE",
        hint: "Check userIdentity.accessKeyId",
        placeholder: "Access Key ID",
        isCaseInsensitive: true
      },
      {
        question: "What MITRE ATT&CK tactic best describes the attack goal?",
        answer: "Exfiltration",
        hint: "Consider the primary objective based on activities",
        placeholder: "Tactic name",
        isCaseInsensitive: true
      }
    ]
  }
];

// Clear and seed database
async function seedDatabase() {
  try {
    console.log('🚀 Starting database seed...\n');

    // Clear existing problem statements
    console.log('🗑️  Clearing existing problem statements...');
    const psRef = collection(db, 'problemStatements');
    const psSnapshot = await getDocs(psRef);
    for (const docSnap of psSnapshot.docs) {
      await deleteDoc(doc(db, 'problemStatements', docSnap.id));
    }

    // Clear existing firstBloods
    console.log('🗑️  Clearing existing first bloods...');
    const fbRef = collection(db, 'firstBloods');
    const fbSnapshot = await getDocs(fbRef);
    for (const docSnap of fbSnapshot.docs) {
      await deleteDoc(doc(db, 'firstBloods', docSnap.id));
    }

    // Seed problem statements
    console.log('\n📝 Seeding problem statements...');
    for (const ps of problemStatements) {
      await setDoc(doc(db, 'problemStatements', `ps${ps.psNumber}`), ps);
      console.log(`   ✅ PS ${ps.psNumber}: ${ps.title}`);
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
      console.log(`   ✅ First blood tracking for PS ${ps.psNumber}`);
    }

    // Clear existing teams
    console.log('\n🗑️  Clearing existing teams...');
    const teamsRef = collection(db, 'teams');
    const teamsSnapshot = await getDocs(teamsRef);
    for (const docSnap of teamsSnapshot.docs) {
      await deleteDoc(doc(db, 'teams', docSnap.id));
    }

    // Create new teams/users
    console.log('\n👥 Creating teams and users...');
    for (const team of sampleTeams) {
      // Hash password
      const hashedPassword = await bcrypt.hash(team.password, 10);

      // Create score structure for non-admin users
      let scoreData = null;
      if (team.role === 'user') {
        scoreData = {
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
      }

      const teamData = {
        username: team.username,
        password: hashedPassword,
        teamName: team.teamName,
        teamMembers: team.teamMembers,
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

    console.log('\n✨ Database seeding completed successfully!');
    console.log('\nSummary:');
    console.log(`   - ${problemStatements.length} Problem Statements created`);
    console.log(`   - ${problemStatements.length * 12} Total questions`);
    console.log(`   - First blood tracking initialized`);
    console.log(`   - ${sampleTeams.filter(t => t.role === 'user').length} Teams created`);
    console.log(`   - 1 Admin account created`);
    console.log('\nLogin Credentials:');
    sampleTeams.forEach(t => {
      console.log(`   - ${t.username} / ${t.password} (${t.role})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
