# Brukina Marketplace — Developer and Deployer Instructions

## Mission

Maintain a real working Vite/React/Supabase marketplace without breaking existing functionality.

## Required workflow

1. Inspect existing implementation before changing code.
2. Reuse existing components and systems.
3. Preserve authentication, routing, marketplace, vendor, rider, driver, wallet, orders and administration.
4. Use the existing Supabase schema and current marketplace source.
5. Never expose service-role keys in frontend code.
6. Never disable Row Level Security.
7. Never delete production data as a shortcut.
8. Never modify backup files.
9. Run `npm run build` after code changes.
10. Test the affected interface in the running Vite application.
11. Test buttons, tabs, links, forms, modals and quantity controls.
12. Test product descriptions, details and images.
13. Test navigation and refresh/back/forward behavior.
14. Check browser console errors.
15. Verify deployment after publishing.
16. Do not report a task as fixed merely because the build passes.
17. Do not treat "No products found" as proof that the product system works.

## Required completion report

Every task must report:

- What changed
- Which files changed
- Build result
- UI test result
- Database/Supabase result when relevant
- Deployment result when relevant
- Remaining unverified items

## Developer Control Center

Use the in-app Developer Control Center for direct instructions, team status and verification tracking.

## Team roles

- Developer: implementation and bug fixing
- QA Tester: interface and regression testing
- Manager: operations/business workflow
- Accountant: financial workflow
- Assistant: operational/customer assistance
- Deployment Team: Vite/build/deployment verification
