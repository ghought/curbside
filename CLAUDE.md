# PCKT Games compatibility

This game must work on its own URL and inside the PCKT Games arcade, in a sandboxed
cross-origin iframe (allow-scripts allow-same-origin only).

## Structure
- Static files only, with no backend unless the game truly needs one.
- Use relative asset paths, so it works on a subpath or a subdomain.
- Keep first load small (aim for under 500 KB compressed). Self-host fonts.
- Use hashed asset names, so stale HTML never points at deleted files.

## Sandbox limits
- No alert(), confirm() or prompt(). Use in-game dialogs.
- No popups, window.open, target="_blank" dependence, or popup sign-in.
- Never navigate the top window.
- When embedded (window.self !== window.top), hide sign-in, site footers and
  external links.

## Layout and input
- Mobile first, portrait preferred. Size to the window, not the screen.
- Handle resize without restarting or reloading.
- If landscape-only, show your own rotate message. Don't rely on orientation lock.
- Support touch and keyboard or mouse. Show your own start screen.

## Audio and game loop
- No sound before a user gesture. Route all audio through one master gain.
- Use one pause flag that freezes simulation and suspends audio.
- Clamp the frame delta, so resuming doesn't jump the game forward.

## Saves
- Wrap all localStorage calls in try/catch, and the game must run if storage is denied.
- Use a key unique to this game, and version the save format.

## Arcade bridge (include from day one)
- Copy adapter/pckt-bridge.js from ghought/pckt-games. Load it before the game script.
- Call PcktBridge.init with gameId, allowedParents ['https://pckt.up.railway.app'],
  and only the capabilities that really work: pause, mute, restart.
- Call playStarted() when a round begins and roundEnded({ score }) at natural breaks.
- Share links use bridge.canonicalUrl() || location.href.
- It must do nothing when the game runs on its own.

## Content
- Don't promise daily content unless publishing is automated. If content runs out,
  fall back to an archive rather than repeating the last item as "today's".

## When finished, give me
Title, one-line description, how to play, category, orientation, aspect ratio,
round length, content notes, third-party services, and a cover idea (one
recognizable object from the game).
