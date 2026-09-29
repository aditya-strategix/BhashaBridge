# BhashaBridge Known Problems & Resolutions

## 1. Analytics Report Generation Race Condition
**Problem:** The Post-Mortem Report took >5 seconds to load and sometimes crashed with database contention.
**Root Cause:**
1. The frontend used lazy-initialization (checking for 404, then sending generation requests).
2. We introduced a "pre-compute" hook on the \Leave Meeting\ button.
3. This caused the background pre-compute task and the frontend report page load to hit the backend simultaneously. Both found no report and started heavy database math (interval merging) in parallel, causing a race condition and CPU spike.
4. Furthermore, \getReport\ was re-calculating the entire meeting duration mathematically *every single time* the report was requested, instead of serving the cached version.
**Resolution:**
- Reverted the frontend pre-compute hook to avoid parallel requests.
- Refactored \ackend/src/controllers/analytics.controller.js\ to use a "One-Shot" generation method. If a report doesn't exist, it is generated and returned immediately.
- Stripped out the redundant mathematical recalculation in \getReport\. It now instantly returns the cached JSON report.

## 2. Global CSS Sledgehammer Layout Breakage
**Problem:** The meeting room controls (camera, mic) turned into giant vertical rectangles overlapping the video, and the Post-Mortem report text was striking through itself.
**Root Cause:**
- An aggressive mobile override block in \globals.css\ applied \width: 100% !important\ to all \utton\ tags globally, and \lex-direction: column\ to all layout containers.
- The Post-Mortem report had absolute positioned massive watermark text (\20vw\) that bled over the readable text on mobile screens.
- The Post-Mortem report header lacked a bottom margin, causing its bottom border to strike through the subsequent text.
**Resolution:**
- Completely deleted the aggressive global button overrides.
- Injected targeted, gentle wrapper classes (\.meetingControlsBar\, \.meetingHeaderRight\) directly into the meeting room JSX to allow flex wrapping without forcing 100% width.
- Added a \.hide-on-mobile\ utility class to hide the giant background watermarks on small screens.
- Fixed the Report spacing by changing the timestamp from \position: absolute\ to \position: relative\ with a top margin, and added a bottom margin to the header.

## 3. Alpine Linux Missing OpenSSL (Prisma Crash)
**Problem:** The backend Docker container crashed on boot with \Error loading shared library libssl.so.1.1\.
**Root Cause:** The \
ode:18-alpine\ image lacks glibc and OpenSSL 1.1, which Prisma Query Engine requires to connect to the database.
**Resolution:** Switched the backend \Dockerfile\ to use \
ode:18-slim\ and installed \openssl\ via \pt-get\.

## Problem 3: Infinite AI Cost Loop from Early Leavers
- **Symptom:** Participants who leave an active meeting are sent to the Report page. If they click "View Synthesis", it generates an AI summary of the meeting *up to that point*. If multiple people leave at different times and click it repeatedly, we get charged for multiple LLM calls for the same active meeting.
- **Root Cause:** /api/meetings/:id/summary and /api/meetings/:id/transcript had no state-checks to ensure the meeting was COMPLETED. 
- **Resolution:** Added a strict guard clause if (meeting.state !== 'COMPLETED') return res.status(403) to both endpoints. The frontend nicely catches this 403 and displays the returned error string ("This meeting is still ongoing. The summary will be available once the host ends the session.") inside the alert modal automatically.
