import { readFileSync } from 'fs';
import { createSign } from 'crypto';

const serviceAccount = JSON.parse(readFileSync('/Users/autonhome/Downloads/vocaltranslate-de75d-firebase-adminsdk-fbsvc-8dd5509cc1.json', 'utf8'));
const projectId = serviceAccount.project_id;

// Generate JWT for Google OAuth2
function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(serviceAccount.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken() {
  const jwt = makeJWT();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

const rulesSource = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write, delete: if request.auth != null;
    }
  }
}`;

async function main() {
  console.log('Getting access token...');
  const token = await getAccessToken();
  console.log('Token OK');

  // Step 1: Create ruleset
  console.log('Creating ruleset...');
  const createRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rulesSource }] } }),
  });
  const createData = await createRes.json();
  console.log('Create response:', JSON.stringify(createData, null, 2));

  if (!createData.name) throw new Error('Ruleset creation failed');
  const rulesetName = createData.name;
  console.log('Ruleset name:', rulesetName);

  // Step 2: Publish ruleset using correct field "ruleset" (not "rulesetName")
  console.log('Publishing ruleset...');
  const patchRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `projects/${projectId}/releases/cloud.firestore`,
      ruleset: rulesetName,
    }),
  });
  const patchData = await patchRes.json();
  console.log('Publish response:', JSON.stringify(patchData, null, 2));

  if (patchData.error) {
    // Try alternate field names if needed
    console.log('Trying with rulesetName field...');
    const patch2Res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        release: {
          name: `projects/${projectId}/releases/cloud.firestore`,
          rulesetName: rulesetName,
        }
      }),
    });
    const patch2Data = await patch2Res.json();
    console.log('Publish response (attempt 2):', JSON.stringify(patch2Data, null, 2));
  } else {
    console.log('SUCCESS! Rules published.');
  }
}

main().catch(console.error);
