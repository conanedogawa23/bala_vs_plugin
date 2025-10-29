#!/usr/bin/env node

/**
 * Test script for Ollama integration
 * Tests code analysis and code generation capabilities
 */

require('dotenv').config();
const OpenAI = require('openai');

// Configuration
const OLLAMA_BASE_URL = 'https://gpu2.oginnovation.com:11434/v1';
const OLLAMA_USERNAME = process.env.OLLAMA_USERNAME || 'bala';
const OLLAMA_PASSWORD = process.env.OLLAMA_PASSWORD || 'Isys@969Isys@969';
const OLLAMA_MODEL = 'mistral:7b'; // Default model

// Create Basic Auth header
const credentials = Buffer.from(`${OLLAMA_USERNAME}:${OLLAMA_PASSWORD}`).toString('base64');

// Initialize OpenAI client
const client = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: 'ollama', // Not used with Basic Auth
  defaultHeaders: {
    'Authorization': `Basic ${credentials}`
  },
  timeout: 60000
});

// Sample code for analysis
const SAMPLE_CODE = `
function calculateTotal(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].quantity;
  }
  return total;
}
`;

// Test 1: Code Analysis
async function testCodeAnalysis() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: CODE ANALYSIS');
  console.log('='.repeat(70));
  console.log(`\nAnalyzing the following JavaScript code:`);
  console.log(SAMPLE_CODE);
  
  const prompt = `Analyze this JavaScript code and provide:
1. A brief summary of what it does
2. Code quality assessment
3. Potential improvements
4. Best practices suggestions

Code:
\`\`\`javascript
${SAMPLE_CODE}
\`\`\`

Provide a structured analysis.`;

  try {
    const startTime = Date.now();
    console.log(`\n🔄 Sending request to Ollama (${OLLAMA_MODEL})...`);
    
    const completion = await client.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert code analyst. Provide structured, actionable analysis with specific improvements.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const elapsed = Date.now() - startTime;
    const response = completion.choices[0]?.message?.content || 'No response';
    
    console.log(`\n✅ Analysis completed in ${elapsed}ms`);
    console.log('\n' + '-'.repeat(70));
    console.log('ANALYSIS RESULT:');
    console.log('-'.repeat(70));
    console.log(response);
    console.log('-'.repeat(70));
    
    // Show token usage
    if (completion.usage) {
      console.log(`\n📊 Token Usage:`);
      console.log(`   Prompt tokens: ${completion.usage.prompt_tokens}`);
      console.log(`   Completion tokens: ${completion.usage.completion_tokens}`);
      console.log(`   Total tokens: ${completion.usage.total_tokens}`);
    }
    
    return { success: true, elapsed, response };
  } catch (error) {
    console.error(`\n❌ Code analysis failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// Test 2: Code Generation
async function testCodeGeneration() {
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST 2: CODE GENERATION');
  console.log('='.repeat(70));
  
  const requirement = `Create a TypeScript function that validates an email address using regex and returns a detailed validation result with the following properties:
- isValid: boolean
- error: string | null
- suggestions: string[]`;

  console.log(`\n📝 Requirement: ${requirement}`);
  
  try {
    const startTime = Date.now();
    console.log(`\n🔄 Generating code with Ollama (${OLLAMA_MODEL})...`);
    
    const completion = await client.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert TypeScript developer. Generate clean, well-documented, production-ready code with proper types and error handling.' 
        },
        { 
          role: 'user', 
          content: requirement 
        }
      ],
      temperature: 0.4,
      max_tokens: 1200
    });

    const elapsed = Date.now() - startTime;
    const response = completion.choices[0]?.message?.content || 'No response';
    
    console.log(`\n✅ Code generated in ${elapsed}ms`);
    console.log('\n' + '-'.repeat(70));
    console.log('GENERATED CODE:');
    console.log('-'.repeat(70));
    console.log(response);
    console.log('-'.repeat(70));
    
    // Show token usage
    if (completion.usage) {
      console.log(`\n📊 Token Usage:`);
      console.log(`   Prompt tokens: ${completion.usage.prompt_tokens}`);
      console.log(`   Completion tokens: ${completion.usage.completion_tokens}`);
      console.log(`   Total tokens: ${completion.usage.total_tokens}`);
    }
    
    return { success: true, elapsed, response };
  } catch (error) {
    console.error(`\n❌ Code generation failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// Test 3: Conversational Code Review
async function testConversationalReview() {
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST 3: CONVERSATIONAL CODE REVIEW');
  console.log('='.repeat(70));
  
  const conversation = [
    { 
      role: 'system', 
      content: 'You are a senior software engineer conducting a code review. Be constructive and specific.' 
    },
    { 
      role: 'user', 
      content: `Review this React component and suggest improvements:\n\n\`\`\`jsx\nfunction UserCard({ user }) {\n  return <div>\n    <h1>{user.name}</h1>\n    <p>{user.email}</p>\n    <button onClick={() => deleteUser(user.id)}>Delete</button>\n  </div>\n}\n\`\`\`` 
    }
  ];
  
  console.log(`\n💬 Starting conversational review...`);
  
  try {
    const startTime = Date.now();
    
    const completion = await client.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: conversation,
      temperature: 0.5,
      max_tokens: 800
    });

    const elapsed = Date.now() - startTime;
    const response = completion.choices[0]?.message?.content || 'No response';
    
    console.log(`\n✅ Review completed in ${elapsed}ms`);
    console.log('\n' + '-'.repeat(70));
    console.log('CODE REVIEW:');
    console.log('-'.repeat(70));
    console.log(response);
    console.log('-'.repeat(70));
    
    return { success: true, elapsed, response };
  } catch (error) {
    console.error(`\n❌ Conversational review failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// Test 4: Model Availability Check
async function testModelAvailability() {
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST 4: MODEL AVAILABILITY CHECK');
  console.log('='.repeat(70));
  
  console.log(`\n🔍 Checking available models on server...`);
  
  try {
    // Simple ping test with minimal request
    const startTime = Date.now();
    const completion = await client.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'user', content: 'Say "OK" if you can read this.' }
      ],
      temperature: 0.1,
      max_tokens: 10
    });

    const elapsed = Date.now() - startTime;
    const response = completion.choices[0]?.message?.content || '';
    
    console.log(`\n✅ Model ${OLLAMA_MODEL} is available and responding`);
    console.log(`   Response time: ${elapsed}ms`);
    console.log(`   Model response: "${response}"`);
    
    return { success: true, elapsed };
  } catch (error) {
    console.error(`\n❌ Model availability check failed:`, error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error(`\n💡 Suggestion: Server at ${OLLAMA_BASE_URL} is not reachable`);
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error(`\n💡 Suggestion: Authentication failed. Check credentials.`);
    } else if (error.message.includes('404')) {
      console.error(`\n💡 Suggestion: Model "${OLLAMA_MODEL}" not found on server`);
    }
    
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          OLLAMA INTEGRATION TEST SUITE                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 Server: ${OLLAMA_BASE_URL}`);
  console.log(`👤 Username: ${OLLAMA_USERNAME}`);
  console.log(`🤖 Model: ${OLLAMA_MODEL}`);
  console.log(`🔐 Auth: Basic (credentials loaded from .env)`);
  
  const results = {
    modelCheck: null,
    codeAnalysis: null,
    codeGeneration: null,
    conversationalReview: null
  };
  
  // Test 1: Check model availability first
  results.modelCheck = await testModelAvailability();
  
  if (!results.modelCheck.success) {
    console.log('\n\n❌ MODEL UNAVAILABLE - Skipping remaining tests');
    printSummary(results);
    process.exit(1);
  }
  
  // Test 2: Code Analysis
  results.codeAnalysis = await testCodeAnalysis();
  
  // Test 3: Code Generation
  results.codeGeneration = await testCodeGeneration();
  
  // Test 4: Conversational Review
  results.conversationalReview = await testConversationalReview();
  
  // Print summary
  printSummary(results);
}

function printSummary(results) {
  console.log('\n\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  
  const tests = [
    { name: 'Model Availability', result: results.modelCheck },
    { name: 'Code Analysis', result: results.codeAnalysis },
    { name: 'Code Generation', result: results.codeGeneration },
    { name: 'Conversational Review', result: results.conversationalReview }
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    if (!test.result) return;
    
    const status = test.result.success ? '✅ PASS' : '❌ FAIL';
    const time = test.result.elapsed ? ` (${test.result.elapsed}ms)` : '';
    console.log(`${status} - ${test.name}${time}`);
    
    if (test.result.success) passed++;
    else failed++;
  });
  
  console.log('\n' + '-'.repeat(70));
  console.log(`Total: ${passed + failed} tests | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('='.repeat(70) + '\n');
  
  if (failed === 0 && passed > 0) {
    console.log('🎉 ALL TESTS PASSED! Ollama integration is working correctly.\n');
    process.exit(0);
  } else if (failed > 0) {
    console.log('⚠️  Some tests failed. Check the errors above for details.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});
