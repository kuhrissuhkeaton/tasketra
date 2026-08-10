# Working notes for Tasketra (Claude sessions)

## Deploy workflow
- Karissa runs `git push origin main` and `npx netlify-cli deploy --prod` herself, from her own terminal. Claude never has Netlify/GitHub network access in the sandbox and cannot run these commands directly.
- Live site: tasketra.com (Netlify project: `charter-pm-karissa2026`).

## Netlify credit optimization (Karissa's standing guidance, Aug 2026)
Keep these in mind for every change that touches deploys, assets, or functions:
- Compress assets, optimize images, and leverage browser caching.
- Optimize function execution time and reduce unnecessary invocations.
- Use branch deploys for testing and limit production deployments.
- Review the Netlify usage dashboard regularly to track all metrics.

Practical implication: bundle related changes into a single production deploy rather than shipping multiple small ones back to back. When multiple pending changes exist (e.g. a CSS update and a content rename), ship them together.
