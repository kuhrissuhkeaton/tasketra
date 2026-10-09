# Working notes for Tasketra (Claude sessions)

## Deploy workflow
- Karissa runs `git push origin main` and `npx netlify-cli deploy --prod` herself, from her own terminal. Claude never has Netlify/GitHub network access in the sandbox and cannot run these commands directly.
- Live app: app.tasketra.com = Netlify project `charter-pm-karissa2026` (id 9f780a23-ee8d-4fee-b96f-dcace24db7ea). This repo deploys ONLY there.
- tasketra.com (the marketing site) is a DIFFERENT project, `chic-biscotti-7d19d7` (id 26de66ba-683a-47ab-95f2-2a5b0e14d317, repo ProjectPMP). Never deploy this repo to it. On 2026-10-09 an app deploy went there by mistake because the folder was linked to the wrong project.
- Before EVERY `npx netlify-cli deploy --prod`, run `npx netlify-cli status` and confirm it prints `Current project: charter-pm-karissa2026` and `Project URL: https://app.tasketra.com`. If not: `npx netlify-cli unlink`, then `npx netlify-cli link --id 9f780a23-ee8d-4fee-b96f-dcace24db7ea`, then check status again.
- After deploying, confirm the live bundle changed: `curl -s https://app.tasketra.com/ | grep -o 'assets/[^"]*'`.

## Netlify credit optimization (Karissa's standing guidance, Aug 2026)
Keep these in mind for every change that touches deploys, assets, or functions:
- Compress assets, optimize images, and leverage browser caching.
- Optimize function execution time and reduce unnecessary invocations.
- Use branch deploys for testing and limit production deployments.
- Review the Netlify usage dashboard regularly to track all metrics.

Practical implication: bundle related changes into a single production deploy rather than shipping multiple small ones back to back. When multiple pending changes exist (e.g. a CSS update and a content rename), ship them together.
