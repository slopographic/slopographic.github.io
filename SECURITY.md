# Security

Slopographic is a static site: every app runs in the visitor's browser, files are handled on the device, and there is no
Slopographic server. Keys people connect for their own AI account stay in their browser and are sent only to that provider.

## Reporting a problem

Please report a security problem privately, not in a public issue:
[Report a vulnerability](https://github.com/slopographic/apps/security/advisories/new) (GitHub's private reporting).

Useful to include: the app and page, what an attacker could do, and steps to reproduce. We aim to reply within a week.

## What counts

- Anything that sends a person's files, keys or data somewhere they did not choose.
- Script injection through files the apps open (PDF, SVG, Office, EML, HTML and others), links or shared workflows.
- Ways around the AI permission prompts, or (once it is released) the pairing code and origin checks of the local agent bridge.
- Problems in how downloads from the cdn are checked (size and SHA-256).

Fixes land on the `testing` branch first and reach the live site at the next milestone, or sooner as a hotfix.
