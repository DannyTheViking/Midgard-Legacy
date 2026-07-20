# Mobile and Signup Fix

## Fixed

- Added the viewport meta tag to every HTML page.
- Village and Wilderness now use the same responsive mobile layout as the other pages.
- Signup errors can no longer display as `{}` or `[object Object]`.
- Added clearer messages for duplicate usernames, existing accounts and rate limiting.
- Added protection for network/runtime signup failures.

## Deploy

Replace the project files, then run:

```bash
git add .
git commit -m "Fix mobile Village and Wilderness and signup errors"
git push origin main
```

After Vercel deploys, testers should clear the browser cache or open the site in a private tab.
