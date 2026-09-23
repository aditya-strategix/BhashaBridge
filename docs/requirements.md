# BhashaBridge — Organization & Google Meet Feature Requirements

Implement an organization-based meeting and participant management system in our existing BhashaBridge Google Meet project.

Before making changes, inspect the existing project, authentication, user system, Google Meet functionality, database models, email/Resend integration, and authorization system. Reuse the existing architecture and conventions wherever and apossible.

Do not unnecessarily replace or duplicate existing functionality.

---

## 1. Organization Creation

A Host should be able to create an organization.

When creating an organization, the Host should provide:

* Organization name
* Optional organization description

The user who creates the organization becomes the **main Host/Owner** of that organization.

Each organization must have:

* A unique identity
* A unique slug/identifier if the existing system uses slugs
* One active organization access code

The Host is the highest-authority user in the organization.

---

## 2. Organization Access Code

When an organization is created, generate a unique access code for that organization.

Example:

```text
Organization:
BhashaBridge Engineering Team

Organization Code:
BB-7K29X
```

The important requirement is:

**The organization must have one persistent access code.**

The code must NOT change every time:

* A participant joins
* An invitation is sent
* A meeting is created
* A participant logs in
* The application restarts

The same code should remain active until the Host explicitly changes/regenerates it.

The access code must be persisted using the existing application's data-storage approach.

---

## 3. Host Can Regenerate Organization Code

The Host should have the ability to regenerate the organization code.

For example:

```text
Current Code:
BB-7K29X

[Regenerate Code]
```

When the Host regenerates it:

1. Generate a new unique code.
2. The new code becomes the active organization code.
3. The previous code becomes invalid.
4. Existing organization memberships should remain intact.
5. The Host remains the organization owner.
6. The new code should be used in future invitations.

Only the main Host/Owner can regenerate the organization code.

A Co-host or normal participant must not be able to regenerate it.

---

## 4. Host Adds Participants Through Email

The Host should be able to add participants to the organization using their email addresses.

The Host should be able to enter multiple email addresses.

Example:

```text
Add Participants

rahul@gmail.com
aman@gmail.com
priya@gmail.com

[Send Invitations]
```

The system should handle each email appropriately.

For each email:

* Validate the email.
* Check whether the user is already a member.
* Avoid creating duplicate memberships.
* Check whether there is already a pending invitation.
* Create/send an invitation when appropriate.

The Host should be able to invite users who are not currently members of the organization.

---

## 5. Invitation Email

Whenever the Host invites a participant, an invitation email should be sent.

The email must be sent through our existing **Resend** integration.

The sender should be:

```text
BhashaBridge <bhashabridge@aditya-kumar.in>
```

Do not hardcode the Resend API key.

Use the existing environment/configuration mechanism already present in the project.

The email should contain relevant information such as:

* BhashaBridge branding/name
* Organization name
* Host name
* Invitation information
* Organization access code
* Invitation/join link
* Instructions for accepting the invitation

Example:

```text
BhashaBridge

You're invited to join:

BhashaBridge Engineering Team

Aditya Kumar has invited you to join this organization.

Organization Code:
BB-7K29X

[Accept Invitation]

If you did not expect this invitation, you can ignore this email.

— BhashaBridge
```

Use the actual user's information dynamically rather than hardcoding these values.

---

## 6. Invitation Link and Organization Code Are Different

Do not treat the organization access code as the invitation token.

The invitation link should use an appropriate secure mechanism for identifying the invitation.

The organization code is the organization's persistent access code.

For example:

```text
Invitation
    ↓
Secure invitation mechanism
    ↓
Accept invitation
    ↓
Become organization member
```

The organization code can additionally be shown in the invitation email.

---

## 7. Participant Accepts Invitation

A participant should be able to accept the invitation from the email.

The expected flow is:

```text
Host creates organization
        ↓
Host adds participant email
        ↓
Invitation created
        ↓
Email sent through Resend
        ↓
Participant receives email
        ↓
Participant opens invitation
        ↓
Participant logs in/registers if necessary
        ↓
Participant accepts invitation
        ↓
Participant becomes organization member
```

The system should prevent unauthorized users from accepting invitations intended for someone else.

---

## 8. Organization Membership

An organization should have a list of members.

Example:

```text
BhashaBridge Engineering Team

Members:

Aditya Kumar     HOST
Rahul Sharma     PARTICIPANT
Aman Singh       PARTICIPANT
Priya Nair       PARTICIPANT
```

The Host should be able to:

* View members
* Add/invite members
* Remove members
* Manage organization membership

Participants should not be able to arbitrarily add or remove other members.

---

## 9. Host Is the Main Boss

There must be a clear authority hierarchy.

The main Host/Owner is the highest-authority person.

The Host controls:

* Organization
* Organization members
* Organization code
* Meetings
* Meeting participants
* Co-host assignments

No other user should be able to override the Host.

The Host should never accidentally lose ownership because another user becomes a Co-host.

---

# 10. Meeting System

The existing Google Meet functionality should be connected to the organization system.

A meeting should belong to an organization.

The Host should be able to create a meeting for the organization.

Only appropriate organization members should be able to access the organization's meetings according to the application's existing authentication and authorization rules.

The implementation should preserve the existing Google Meet functionality.

---

# 11. Meeting Host

When the Host creates a meeting, the Host becomes the main Host of that meeting.

The Host should have complete meeting-management authority.

The Host should be able to:

* Start/end the meeting
* Admit participants
* Reject participants
* Remove participants
* Manage participants
* Create Co-hosts
* Remove Co-host permissions
* Control other meeting functionality already supported by the application

The exact implementation should follow the existing meeting architecture.

---

# 12. Participant Admission / Waiting Room

When a participant attempts to join a meeting, the application should support an admission/waiting process.

Conceptually:

```text
Participant
     ↓
Requests to join
     ↓
Waiting
     ↓
Host or Co-host
     ↓
Admit / Reject
```

The Host should see participants waiting to join.

For example:

```text
Waiting to Join

Rahul Sharma
[Admit] [Reject]

Aman Singh
[Admit] [Reject]
```

The Host can admit or reject them.

---

# 13. Co-Host System

The Host should be able to make **any existing member of the organization** a Co-host for a meeting.

Example:

```text
Organization Members

Aditya Kumar       HOST
Rahul Sharma       PARTICIPANT
Aman Singh         PARTICIPANT
Priya Nair         PARTICIPANT
```

The Host can select:

```text
Rahul Sharma → Make Co-host
```

After that:

```text
Aditya Kumar       HOST
Rahul Sharma       CO-HOST
Aman Singh         PARTICIPANT
Priya Nair         PARTICIPANT
```

The Host should be able to create multiple Co-hosts.

---

# 14. Co-Host Powers

A Co-host should receive delegated **meeting-management powers**.

Most importantly, the Co-host must be able to:

* See participants waiting to join
* Admit waiting participants
* Reject waiting participants
* Remove participants from the meeting
* Manage participants using the meeting functionality available to the application

This means the Host does not have to personally admit every participant.

Example:

```text
Participant
     ↓
Waiting Room
     ↓
┌──────────────────┐
│ Rahul wants in   │
│                  │
│ [Admit] [Reject] │
└──────────────────┘
     ↑
     │
Host OR Co-host
```

Both the Host and Co-host should be able to perform the admission action.

---

# 15. Co-Host Does NOT Become the Main Boss

Making someone a Co-host must **not** transfer organization ownership.

For example:

```text
Aditya → HOST
Rahul  → CO-HOST
```

Rahul does NOT become the organization owner.

Aditya remains the main Host.

The Co-host must not be able to:

* Remove the Host
* Replace the Host
* Transfer organization ownership
* Delete the organization
* Change the organization owner
* Regenerate the organization access code
* Manage organization-level settings unless explicitly permitted separately
* Add/remove organization members unless the existing product explicitly grants that permission
* Promote another participant to Co-host
* Demote the Host

The Host remains the final authority.

---

# 16. Host Can Remove Co-Host

The Host should be able to revoke Co-host permissions at any time.

Example:

```text
Rahul Sharma
CO-HOST

[Remove Co-host]
```

After removal:

```text
Rahul Sharma
PARTICIPANT
```

The participant remains a member of the organization.

Only their meeting Co-host permission is removed.

---

# 17. Multiple Co-Hosts

The Host should be able to assign multiple Co-hosts.

Example:

```text
HOST

Aditya Kumar

CO-HOSTS

Rahul Sharma
Aman Singh
Priya Nair

PARTICIPANTS

20 other members
```

All Co-hosts can help manage participants in the meeting.

The Host remains above all Co-hosts.

---

# 18. Co-Host Permissions Should Be Meeting-Specific

Treat Co-host as a meeting-level permission unless the existing product has a deliberate requirement for organization-wide Co-hosts.

For example:

```text
Organization Member
        ↓
Invited to Meeting
        ↓
Host makes them Co-host
        ↓
They have Co-host powers in that meeting
```

Being a Co-host in one meeting should not automatically make the user the organization owner or give them organization-management authority.

If the application already has a different role system, integrate with it rather than creating unnecessary duplicate roles.

---

# 19. Keep Organization Roles and Meeting Roles Separate

There should be a conceptual distinction between:

### Organization authority

```text
Host/Owner
Member
```

and:

### Meeting authority

```text
Host
Co-host
Participant
```

For example:

```text
Organization

Aditya
  Organization: OWNER

Rahul
  Organization: MEMBER
```

Meeting:

```text
Meeting #123

Aditya
  Meeting: HOST

Rahul
  Meeting: CO-HOST
```

Rahul therefore gets meeting-management permissions without becoming the organization owner.

---

# 20. Authorization and Security

All important permissions must be enforced by the application, not merely hidden in the UI.

The system should verify that the user performing an action actually has permission to perform it.

For example:

```text
Host:
Can admit participant        YES
Can make Co-host             YES
Can remove Co-host           YES
Can regenerate org code      YES
Can manage organization      YES

Co-host:
Can admit participant        YES
Can reject participant       YES
Can remove participant       YES
Can make another Co-host     NO
Can regenerate org code      NO
Can transfer ownership       NO
Can remove Host              NO

Participant:
Can join meeting             YES
Can admit others              NO
Can make Co-host              NO
Can manage organization       NO
```

Do not rely solely on frontend visibility for these restrictions.

---

# 21. Organization Code and Co-Host Are Separate Concepts

Do not mix these two features.

The organization code is for identifying/accessing the organization.

The Co-host role is a permission granted by the Host for meeting management.

For example:

```text
Organization Code
BB-7K29X
```

does NOT mean:

```text
Everyone with BB-7K29X is automatically a Co-host.
```

Only the Host can grant Co-host permissions.

---

# 22. Host Dashboard Requirements

The Host should have access to organization information including:

```text
Organization
BhashaBridge Engineering Team

Organization Code
BB-7K29X

[Copy Code]
[Regenerate Code]

Members
--------------------------
Aditya Kumar       HOST
Rahul Sharma       MEMBER
Aman Singh         MEMBER
Priya Nair         MEMBER

[Add Participants]
```

The Host should also be able to access the organization's meetings.

For a meeting:

```text
Meeting

Host:
Aditya Kumar

Co-hosts:
Rahul Sharma
Aman Singh

Participants:
24

Waiting:
3
```

---

# 23. Participant Dashboard Requirements

A participant should be able to see the organizations they belong to and the meetings they are allowed to access.

They should not see Host-only management controls.

For example:

```text
Organization

BhashaBridge Engineering Team

Code:
BB-7K29X

Upcoming Meeting

BhashaBridge Weekly Meeting

[Join Meeting]
```

---

# 24. Co-Host Meeting Experience

A Co-host should see meeting-management controls appropriate to their permissions.

For example:

```text
BhashaBridge Meeting

You are a Co-host

Waiting to Join

Rahul
[Admit] [Reject]

Aman
[Admit] [Reject]

Participants

24 participants
```

But they should not receive organization-owner controls such as:

```text
Regenerate Organization Code
Delete Organization
Transfer Ownership
Manage Organization
```

---

# 25. Invitation Email Must Use the Organization Code

The invitation email sent through:

```text
bhashabridge@aditya-kumar.in
```

should contain the current organization code.

If the Host later regenerates the organization code, future invitations should contain the new code.

Do not continue sending the old code after regeneration.

Existing accepted memberships should not automatically be deleted merely because the code was regenerated.

---

# 26. Duplicate and Existing Users

Handle these cases properly:

### User already belongs to organization

Do not create another membership.

### Invitation already pending

Do not unnecessarily create duplicate invitations.

Allow the Host to resend the invitation if appropriate.

### User does not have an account

Allow them to follow the invitation flow and create an account if the existing authentication system supports registration.

### Invalid email

Show an appropriate validation error.

### Same email entered multiple times

Avoid duplicate processing.

---

# 27. Resend Email Requirements

Use the existing Resend setup.

The sender must be:

```text
BhashaBridge <bhashabridge@aditya-kumar.in>
```

Invitation emails should be generated dynamically.

Do not hardcode:

* Organization name
* Host name
* Participant name
* Organization code
* Invitation token/link

These should come from the actual application data.

---

# 28. Preserve Existing Functionality

Do not unnecessarily rewrite existing Google Meet functionality.

Before implementation, understand:

* Existing authentication
* Existing users
* Existing organizations, if already present
* Existing meetings
* Existing participant handling
* Existing Google Meet integration
* Existing email/Resend implementation
* Existing authorization
* Existing database structure

Then integrate these requirements into the current system.

---

# 29. Do Not Assume a Specific Architecture

Do not force a particular:

* Backend architecture
* Frontend framework
* Database schema
* Folder structure
* API naming convention
* Service structure
* State-management library
* UI component library

Use the architecture already present in the project.

If an equivalent existing feature already exists, extend it instead of creating a duplicate implementation.

---

# 30. Complete Expected Flow

The final system should support this complete flow:

```text
                         HOST
                          │
                          ▼
                 Creates Organization
                          │
                          ▼
                Organization Code Created
                          │
                          ▼
               Adds Participant Emails
                          │
                          ▼
                     Resend Email
                          │
                          ▼
               Participant Receives Email
                          │
                          ▼
                  Accepts Invitation
                          │
                          ▼
                Becomes Organization Member
                          │
                          ▼
                   Host Creates Meeting
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
         Participant               Host
         joins meeting         manages meeting
             │                         │
             ▼                         │
        Waiting Room                   │
             │                         │
             └────────────┬────────────┘
                          ▼
                  Host admits user
                          │
                          ▼
                       Meeting
```

And for Co-hosts:

```text
Host
 │
 │ selects organization member
 ▼
Make Co-host
 │
 ▼
Co-host
 │
 ├── Admit participants
 ├── Reject participants
 ├── Remove participants
 └── Manage meeting participants
```

While:

```text
Host
 │
 ├── Everything Co-host can do
 ├── Manage organization
 ├── Manage members
 ├── Regenerate organization code
 ├── Create/remove Co-hosts
 ├── Control meetings
 └── Remains the main authority
```

---

# 31. Acceptance Criteria

Consider the feature complete only when the following behavior works:

### Organization

* Host can create an organization.
* Organization receives a persistent access code.
* Code remains unchanged until Host regenerates it.
* Host can regenerate the code.
* Old code becomes invalid after regeneration.

### Invitations

* Host can enter participant emails.
* Multiple participants can be invited.
* Invitations are sent through Resend.
* Sender is `bhashabridge@aditya-kumar.in`.
* Invitation contains the organization information and current code.
* Participant can accept the invitation.
* Duplicate memberships are prevented.

### Meetings

* Host can create a meeting for the organization.
* Organization members can access appropriate meetings.
* Participants can enter a waiting state.
* Host can admit/reject participants.

### Co-hosts

* Host can make any organization member a Co-host.
* Multiple Co-hosts are supported.
* Co-hosts can admit participants.
* Co-hosts can reject/remove participants where supported.
* Host can remove Co-host permissions.
* Co-host cannot become the organization owner.
* Co-host cannot remove/replace the Host.
* Co-host cannot regenerate the organization code.
* Co-host cannot transfer ownership.
* Co-host cannot promote other Co-hosts unless explicitly granted such permission by a future feature.
* Host remains the final authority.

### Security

* Permissions are validated by the application.
* Unauthorized users cannot perform Host/Co-host actions simply by calling the relevant functionality directly.
* Invitation links cannot be arbitrarily used by unrelated users.
* Organization access and meeting access respect authentication and membership.

---

## Final Instruction

Implement the above requirements in the existing BhashaBridge project.

**Do not blindly follow any specific technical implementation described in this prompt.** Inspect the existing project first and choose the implementation that best fits its current architecture.

Prioritize:

1. Correct authorization
2. Persistent organization membership
3. Persistent organization code
4. Secure invitations
5. Reliable Resend email delivery
6. Host-controlled Co-host delegation
7. Participant admission by both Host and Co-host
8. Host remaining the ultimate authority
9. Compatibility with the existing Google Meet functionality
10. Avoiding unnecessary architectural changes
