const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Excel to JSON Converter for SOC Problem Statements
 * 
 * Excel Format Expected:
 * - Each sheet represents a Problem Statement (PS1, PS2, etc.)
 * - Columns:
 *   A: No. (question number)
 *   B: Question
 *   C: Answer
 *   D: format (placeholder text for the input field)
 *   E: case sensitivity (TRUE = case sensitive, FALSE = case insensitive)
 * 
 * Output: JSON file with problem statements array
 */

// Configuration
const EXCEL_FILE = 'SOC - Questions.xlsx'; // Change this to your Excel file name
const OUTPUT_FILE = 'questions.json';

function convertExcelToJson(excelPath, outputPath) {
  try {
    // Read the Excel file with date parsing disabled to get raw values
    const workbook = XLSX.readFile(excelPath, { 
      cellDates: false,  // Keep dates as numbers
      raw: false,        // Get formatted strings where possible
      cellText: true     // Include text representation
    });
    
    console.log(`Found ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`);
    
    const problemStatements = [];
    
    // Process each sheet
    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
      const psNumber = sheetIndex + 1;
      console.log(`\nProcessing Sheet: ${sheetName} (PS ${psNumber})`);
      
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert sheet to JSON (with header row) - get raw values
      const rawData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        raw: false,     // Get formatted values where Excel has formatting
        defval: ''      // Default empty string for empty cells
      });
      
      if (rawData.length < 2) {
        console.log(`  Skipping sheet ${sheetName} - no data`);
        return;
      }
      
      // Get headers (first row)
      const headers = rawData[0];
      console.log(`  Headers: ${headers.join(', ')}`);
      
      // Process questions (skip header row)
      const questions = [];
      
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        
        // Skip empty rows
        if (!row || row.length === 0 || !row[0]) {
          continue;
        }
        
        const questionNum = row[0]; // Column A: No.
        const questionText = row[1]; // Column B: Question
        const answer = row[2]; // Column C: Answer
        const format = row[3] || ''; // Column D: format (placeholder)
        const caseSensitivityValue = row[4]; // Column E: case sensitivity
        
        // Determine if case sensitive (default to FALSE/case insensitive if not specified)
        // TRUE in Excel means case sensitive, FALSE means case insensitive
        // We convert this to isCaseSensitive field
        let isCaseSensitive = false;
        if (caseSensitivityValue !== undefined && caseSensitivityValue !== null) {
          // Handle various Excel boolean representations
          if (typeof caseSensitivityValue === 'boolean') {
            isCaseSensitive = caseSensitivityValue;
          } else if (typeof caseSensitivityValue === 'string') {
            isCaseSensitive = caseSensitivityValue.toUpperCase() === 'TRUE';
          }
        }
        
        if (questionText && answer !== undefined && answer !== null && answer !== '') {
          const questionObj = {
            question: String(questionText).trim(),
            answer: String(answer).trim(),
            placeholder: String(format).trim() || 'Enter your answer',
            // Note: We're using isCaseSensitive now (TRUE = case matters)
            // This is the OPPOSITE of the old isCaseInsensitive field
            isCaseSensitive: isCaseSensitive
          };
          
          questions.push(questionObj);
          console.log(`  Q${questionNum}: "${questionText.substring(0, 40)}..." - Case Sensitive: ${isCaseSensitive}`);
        }
      }
      
      if (questions.length > 0) {
        const problemStatement = {
          psNumber: psNumber,
          title: '', // Leave empty as requested
          severity: '', // Leave empty as requested
          link: '', // Leave empty as requested
          description: '', // Leave empty as requested
          questions: questions
        };
        
        problemStatements.push(problemStatement);
        console.log(`  Total questions: ${questions.length}`);
      }
    });
    
    // Write to JSON file
    const jsonOutput = JSON.stringify(problemStatements, null, 2);
    fs.writeFileSync(outputPath, jsonOutput, 'utf8');
    
    console.log(`\n✅ Successfully converted ${problemStatements.length} problem statements`);
    console.log(`📄 Output saved to: ${outputPath}`);
    
    return problemStatements;
    
  } catch (error) {
    console.error('❌ Error converting Excel to JSON:', error.message);
    throw error;
  }
}

// Generate seedDB compatible code
function generateSeedCode(problemStatements, outputPath) {
  let code = `// Auto-generated Problem Statements from Excel
// Generated on: ${new Date().toISOString()}

const problemStatements = ${JSON.stringify(problemStatements, null, 2)};

module.exports = { problemStatements };
`;
  
  const seedOutputPath = outputPath.replace('.json', '.seed.js');
  fs.writeFileSync(seedOutputPath, code, 'utf8');
  console.log(`📄 Seed file saved to: ${seedOutputPath}`);
}

// Main execution
const dataDir = __dirname;
const excelPath = path.join(dataDir, EXCEL_FILE);
const outputPath = path.join(dataDir, OUTPUT_FILE);

if (!fs.existsSync(excelPath)) {
  console.error(`❌ Excel file not found: ${excelPath}`);
  console.log('\nPlease ensure the Excel file exists in the data folder.');
  console.log('Expected format:');
  console.log('  Column A: No. (question number)');
  console.log('  Column B: Question');
  console.log('  Column C: Answer');
  console.log('  Column D: format (placeholder text)');
  console.log('  Column E: case sensitivity (TRUE/FALSE)');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Excel to JSON Converter for SOC Problem Statements');
console.log('='.repeat(60));
console.log(`\nInput: ${excelPath}`);
console.log(`Output: ${outputPath}`);

const problemStatements = convertExcelToJson(excelPath, outputPath);
generateSeedCode(problemStatements, outputPath);

console.log('\n' + '='.repeat(60));
console.log('Conversion complete!');
console.log('='.repeat(60));
