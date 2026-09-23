const jwt = require('jsonwebtoken');

async function test() {
  const token = jwt.sign(
    { userId: '03aa304b-d57f-455d-9df1-3586b5c58b6b', role: 'PARTICIPANT', language: 'en' },
    '4monkeys',
    { expiresIn: '24h' }
  );

  try {
    const res = await fetch('http://localhost:5000/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        title: "sss",
        startTime: "22-09-2026 14:47",
        state: "SCHEDULED",
        organizationId: "6b38793f-4a37-475f-be35-bbd88b9bc706"
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (err) {
    console.log("Full error:", err.message);
  }
}
test();

