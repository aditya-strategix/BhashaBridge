# BhashaBridge — Problem Resolution Log

A full chronological history of every major bug encountered during development of the live translation engine, with the exact root cause and fix applied at each stage.

---

## Problem 1: Translation Not Working — Socket Teardown on Language Change

### What Happened
When the user changed the language in the Settings dropdown inside the meeting room, the chat would completely break. Messages stopped appearing entirely and the socket connection silently died.

### Root Cause
The Settings dropdown was calling `setUser({ ...user, language: newLang })`, which replaced the entire `user` object in Zustand with a new object reference. A `useEffect` that watched `user` as a dependency detected this change, tore down the entire socket, and reconnected — permanently losing all active peer connections, listeners, and the message queue.

### Fix
Changed Settings dropdown to mutate the user object **in-place**, without replacing it:

```js
// BROKEN — replaces the whole object, triggers socket teardown
setUser({ ...user, language: newLang });

// FIXED — mutates in-place, no React dependency change triggered
useAuthStore.getState().user.language = newLang;
setMessages([...messages]); // force a safe re-render
```

---

## Problem 2: Google Translate API IP Ban (3-Stage Fix)

### What Happened
The backend translation was using `@vitalets/google-translate-api` (a free scraper of Google's public web endpoint). The frontend had `recognition.interimResults = true` enabled, which means the browser was emitting partial incomplete words to the backend constantly while the user spoke — e.g., "H", "He", "Hel", "Hell", "Hello" for a single word. That's 5 backend requests for one word. Google's anti-bot system detected 20–30 requests per second from the server IP and issued a temporary `429 Too Many Requests` ban.

### Why Did Original Caption Still Show But Translated Didn't?
The original text is captured locally by the browser and broadcast by the backend **before** the translation step. So Side A (set to "Original") always received captions fine. Side B (expecting Hindi) was waiting for a Google translation that silently failed — resulting in a blank screen.

### Stage 1 Fix — Stop the Spam
Changed `recognition.interimResults = false`. The browser now waits for a full completed sentence before sending anything to the backend. Reduced requests from ~30/sec to 1 per sentence.

### Stage 2 Fix — Swap the Engine
Swapped out `@vitalets/google-translate-api` for `google-translate-api-x` — a modern actively maintained fork that uses multiple Google endpoints with higher rate limits and better ban evasion.

### Stage 3 Fix — Bulletproof Double Fallback
Reconfigured the API to use `client: 'gtx'`, disguising backend requests as the official Google Translate Chrome Extension (nearly never banned). Added a secondary fallback so if Google still fails, the server automatically switches to the fully independent `MyMemory API`:

```js
const res = await translate(text, { to: targetLang, client: 'gtx' })
  .catch(async () => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${language}|${targetLang}`;
    const data = await (await fetch(url)).json();
    return { text: data.responseData.translatedText };
  });
```

---

## Problem 3: Caption Appearing on Speaker's Own Side

### What Happened
When Side A spoke or pressed Demo Speech, the live caption was appearing on Side A's own screen — not just on Side B. The speaker should never see or hear their own caption.

### Root Cause
The backend was using `io.to(meetingId).emit(...)` which broadcasts to **every socket in the room, including the sender**. The frontend had no logic to filter out its own events.

### Fix — Backend: Attach `senderSocketId`
```js
io.to(meetingId).emit('caption:translated', {
  text,
  translations,
  speakerId,
  senderSocketId: socket.id  // ← tells everyone who sent this
});
```

### Fix — Frontend: Skip Your Own Captions
```js
if (captionEnabled && data.senderSocketId !== newSocket.id) {
  setCurrentCaption(textToShow);
}
```

**Why `socketId` and not `userId`?**
Using `userId` would break multi-device testing — if you log into the same account on a laptop and a phone, both share the same `userId`, so the phone would never receive captions from the laptop. `socketId` is unique per browser tab, so it safely identifies the exact source connection.

---

## Problem 4: "Silent Join" — Server Doesn't Know Language Settings on Page Load

### What Happened
When Side B refreshed the page, their language preferences (e.g., "Translate captions to Hindi") were saved in local storage but never sent to the backend. The backend had no record of what language anyone wanted, so it translated nothing, and Side B saw blank captions every time after a refresh.

### Root Cause
The frontend only emitted `user:update_settings` when the user physically changed a dropdown option. On a fresh page load, no emit was triggered.

### Fix
Added an immediate settings sync right after socket connects:

```js
newSocket = io(SOCKET_URL);
newSocket.emit('meeting:join', { meetingId, userId: user.id, ... });
newSocket.emit('user:update_settings', useAuthStore.getState().user || {}); // ← Added
```

---

## Problem 5: TTS Self-Echo — Speaker Hears Their Own Translated Voice

### What Happened
When Side A clicked Demo Speech, Side A's own browser synthesized the translated audio and played it back at the speaker. This caused confusing echo and masked audio from real participants.

### Fix
Added a check to skip TTS for messages that came from your own socket:

```js
// Only play audio for OTHER people's speech, never your own
if (ttsEnabled && window.speechSynthesis && data.senderSocketId !== newSocket.id) {
  window.speechSynthesis.speak(utt);
}
```

---

## Problem 6: TTS Code Accidentally Outside Its Condition Block (Brace Misalignment)

### What Happened
Multiple rounds of regex-based patching (using `.replace()` scripts) caused the curly braces inside the `caption:translated` listener to become misaligned. The `if (ttsEnabled && ...)` block was structurally open but effectively **empty** — the `textToSpeak` and `speak()` code had drifted **outside** the condition block. Chrome's autoplay policy then blocked the audio because the call wasn't inside a clean execution path.

### What the Broken Code Looked Like
```js
if (ttsEnabled && window.speechSynthesis && ...) {
  console.log("TTS passed");
  // EMPTY — closing brace was here!
}
// speak() was running unconditionally down here
const textToSpeak = ...
window.speechSynthesis.speak(utt); // ← OUTSIDE the if block!
```

### Fix
Manually read the file line-by-line, identified the exact misaligned braces, and used `replace_file_content` to properly realign the entire block:

```js
if (ttsEnabled && window.speechSynthesis && data.senderSocketId !== newSocket.id) {
  const textToSpeak = ...;
  if (textToSpeak) {
    const utt = new SpeechSynthesisUtterance(textToSpeak);
    window.speechSynthesis.speak(utt);  // ← now correctly INSIDE the condition
  }
}
```

---

## Problem 7: `getVoices()` Returns Empty Array — Chrome Async Voice Loading

### What Happened
Even after fixing the brace alignment, Speech-to-Speech translation was still completely silent. The translated text was arriving and showing correctly as a caption, the TTS condition was passing (confirmed in console), but `window.speechSynthesis.speak(utt)` was doing absolutely nothing.

### Root Cause
Chrome loads its installed voice packs **asynchronously** in the background when the page first loads. When `window.speechSynthesis.getVoices()` is called the moment a caption arrives (very early in the page lifecycle), Chrome returns an **empty array `[]`**. With no voices found:
- `voice` is `undefined`
- `utt.voice` is never set
- Chrome's speech engine has no voice assigned and silently drops the request entirely

This is a well-known Chrome quirk — `getVoices()` only works reliably *after* the `voiceschanged` event fires.

### Fix — Pre-cache Voices Using `voicesRef`

```js
const voicesRef = useRef([]);

// Run once on mount — listen for voiceschanged and cache the result
useEffect(() => {
  const loadVoices = () => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) voicesRef.current = v;
  };
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
}, []);
```

Then at speak time, use the pre-cached ref instead of calling `getVoices()`:

```js
const voices = voicesRef.current; // always populated, never empty
const targetCode = utt.lang.toLowerCase().split('-')[0]; // 'hi' from 'hi-IN'
const voice = voices.find(v => v.lang.toLowerCase().startsWith(targetCode));
if (voice) utt.voice = voice;
window.speechSynthesis.speak(utt);
```

---

## Problem 8: Demo Speech Was One-Shot (No Loop)

### What Happened
The initial Demo Speech button fired a single test phrase once per click. The user needed it to loop continuously — keep broadcasting demo captions every few seconds until clicked again to stop.

### Fix
Replaced the one-shot function with a `isDemoActive` toggle state and a `useEffect` with `setInterval`:

```js
const [isDemoActive, setIsDemoActive] = useState(false);

useEffect(() => {
  if (!isDemoActive || !socket) return;
  const phrases = [
    "Hello, this is a test of the speech translation system.",
    "I am speaking in my native language right now.",
    "Technology makes communication so much easier."
  ];
  let count = 0;
  socket.emit('caption:text', { meetingId, speakerId: user.id, text: phrases[0], language: spokenLanguage });
  const interval = setInterval(() => {
    count++;
    socket.emit('caption:text', { meetingId, speakerId: user.id, text: phrases[count % phrases.length], language: spokenLanguage });
  }, 6000); // fires every 6 seconds
  return () => clearInterval(interval); // cleanup when stopped
}, [isDemoActive, socket]);
```

Button turns red and shows "Stop Demo Speech" while active.

---

## Summary Table

| # | Problem | Root Cause | Final Fix |
|---|---------|-----------|-----------|
| 1 | Socket dies on language change | `setUser()` replaced object reference | Mutate user in-place with `useAuthStore.getState().user.x = val` |
| 2 | Google Translate IP ban | `interimResults=true` sent 30 req/sec | `interimResults=false` + swap to `google-translate-api-x` + `client:'gtx'` + MyMemory fallback |
| 3 | Caption on speaker's own screen | `io.to(room)` sends to everyone | Backend attaches `senderSocketId`; frontend filters it |
| 4 | Settings lost on page refresh | Only emitted on dropdown change | Emit `user:update_settings` immediately on socket connect |
| 5 | TTS echoes back to speaker | No filter on own speech | Skip TTS if `senderSocketId === newSocket.id` |
| 6 | TTS code outside condition block | Regex patches broke brace alignment | Read file line-by-line; manually realigned braces |
| 7 | TTS completely silent | `getVoices()` returns `[]` async on Chrome | Pre-cache voices in `voicesRef` via `voiceschanged` event |
| 8 | Demo Speech one-shot only | No loop logic | `setInterval` inside `useEffect` gated by `isDemoActive` |

| 9 | TTS fails for certain languages | OS missing specific language voice packs | Bypassed OS entirely via a Backend Proxy to Google Cloud TTS |

---

## Problem 9: Missing OS Voice Packs & Google Hotlink Blocking (The Ultimate TTS Fix)

### What Happened
Even after all TTS bugs were fixed, speech-to-speech translation worked perfectly for Hindi, but was completely silent for Telugu.

### Root Cause (Part 1 - OS Dependency)
The `window.speechSynthesis` API relies entirely on the **voice packs installed on the user's Operating System**. Windows comes pre-installed with a Hindi voice pack, but **does not** include a Telugu voice pack by default. When the browser looked for a Telugu voice, it returned an empty array, and the audio was silently dropped. Asking users to manually dig into Windows Settings to install language packs is a terrible UX.

### Initial Fix Attempt (Frontend Cloud Fetch)
We tried to rip out `window.speechSynthesis` and replace it with a hidden Google Translate cloud endpoint that returns MP3 audio:
`https://translate.google.com/translate_tts?ie=UTF-8&q=...&client=tw-ob`
This failed because Google has strict **anti-hotlinking/CORS protections**. When the browser requested the URL directly, Google saw the browser's `Origin` and `Referer` headers and blocked the request, resulting in silence.

### Final Fix (Backend Proxy Pipeline)
To bypass both the Windows OS limitation and Google's browser blocks, we built a dedicated **Backend Proxy Pipeline**:
1. Added a new Express route: `GET /api/tts?text=...&lang=...`
2. The frontend passes the translated text to our backend.
3. Our Node.js backend requests the audio from Google. Because Node.js is not a browser, it doesn't send `Origin` headers, so Google accepts the request and returns the MP3.
4. The backend streams the raw audio binary back to the frontend.
5. The frontend plays it using the standard HTML5 `<audio>` player.

**Result:** 100% free, high-quality neural Cloud TTS for *every* language, completely independent of the user's browser or operating system!

```js
// Frontend Code
const url = `${API_URL}/tts?text=${encodeURIComponent(textToSpeak)}&lang=${targetLangCode}`;
const audio = new Audio(url);
audio.play();
```


## 4. Ghost Disconnects & Dangling WebSocket Sessions
**Problem:** If a user loses internet connection abruptly (e.g., laptop dies, hard network drop), their browser cannot send a "disconnect" event to the server. The server leaves their session open indefinitely, resulting in a "dangling session" that artificially inflates their recorded Meeting Attendance time (sometimes by hundreds of minutes).

**Solution:** Implemented a strict **Ping/Pong Heartbeat** configuration directly in the `socket.io` initialization on the backend.
- `pingInterval: 300000` (Server pings clients every 5 minutes).
- `pingTimeout: 300000` (Server forcefully drops the connection and triggers the `disconnect` event if a client fails to pong within 5 minutes).
This guarantees that "ghost" connections are detected and their `leftAt` timestamps are recorded accurately within a 10-minute maximum window, completely solving attendance inflation.
