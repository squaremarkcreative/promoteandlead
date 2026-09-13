# Local design proposal

Start with `python3 proposal/server.py`, then open http://127.0.0.1:4173.

Use the top bar to switch among Website, Student, Instructor, and Review notes. No sign-in is needed. All people, readiness figures, and session dates are illustrative. Curriculum titles and pricing are copied from the current repository. Full review findings and scope limitations are in Review notes.

This is a separate interactive interface prototype, not a replacement for the authenticated application. It does not load .dev.vars, call Supabase, send messages, issue certificates, or alter existing application files. Drafts, student task readiness, and attendance use browser localStorage under the `pl-proposal-` prefix. Instructor discussion position and completion are saved on the preview server. Reset sample changes affects browser-local sample data, not shared server teaching progress.

The Python server binds to loopback only, serves an explicit public-file allowlist, and accepts validated same-origin POST requests only for the local teaching-progress endpoint. Current homepage and sign-in comparison routes suppress fetch requests. Production files and APIs are unchanged. No commit or deployment has been performed.

Verification: JavaScript syntax check, all principal route render functions exercised with a minimal DOM stub, and HTTP 200 from the running server. Browser visual and end-to-end interaction checks could not be performed because no browser was available to the session.


## Server-saved instructor progress

The local preview stores a single shared demo teaching record in `proposal/.state/teaching.sqlite3` (ignored by Git and excluded from the public allowlist). The record persists across server restarts and is available to other browsers connected to this same local server. This is not signed-in instructor/cohort storage and does not sync to another computer or production.

On first load, if the server has no record, the opening browser transfers its prior local teaching position and completion. After a confirmed save, those old browser-only keys are removed. Thereafter the server is authoritative. Save status is acknowledged only after the database commit. Navigation is paused while saving or after an error, with retry or reload actions. Revision conflicts prevent stale browsers from overwriting newer progress. Opening a different browser or reloading retrieves the current server state; this is not continuous real-time synchronization.

The live classroom already has cohort-level covered-task storage. Production integration should use its existing authenticated staff/cohort authorization and extend persistence to exact discussion position; the demo endpoint must not be exposed publicly as an account backend.

Validated with isolated HTTP clients: cross-client reads, restart persistence, invalid-state rejection, same-origin checks and revision conflicts; client restore, acknowledged save, error and conflict messages. Earlier teaching-flow documentation describing browser-only instructor progress is superseded by this section.
