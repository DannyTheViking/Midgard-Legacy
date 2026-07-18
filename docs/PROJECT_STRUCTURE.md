# Project structure

```text
MidgardLegacy/
├── README.md                    Main setup instructions
├── index.html                   Root redirect/entry file
├── components/                  Shared HTML loaded on game pages
│   ├── sidebar.html
│   ├── topbar.html
│   └── footer.html
├── css/
│   ├── style.css                Main game and mobile styling
│   └── property.css             Property-only styling
├── js/                          Browser JavaScript
│   ├── auth.js                  Supabase client, signup and login
│   ├── components.js            Sidebar/topbar loader
│   ├── game-utils.js            Shared game helper functions
│   ├── tutorial.js              Tutorial guidance and progression UI
│   ├── profile.js               Player profile and add/remove relations
│   ├── friends-enemies.js       Friends and enemies list page
│   └── ...                      One file per main page/system
├── pages/                       Website pages
│   ├── index.html               Public landing page
│   ├── login.html
│   ├── signup.html
│   ├── home.html
│   ├── profile.html
│   ├── friends-enemies.html
│   └── ...
├── supabase/
│   └── migrations/              SQL to run in Supabase, in order
│       └── 001_player_relations.sql
└── docs/
    └── PROJECT_STRUCTURE.md      This guide
```

## Naming rule

A page and its JavaScript use the same name wherever possible:

- `pages/profile.html` → `js/profile.js`
- `pages/friends-enemies.html` → `js/friends-enemies.js`
- `pages/hall-of-fame.html` → `js/hall-of-fame.js`

## Shared files

Do not copy the sidebar or topbar into every page. They are loaded from:

- `components/sidebar.html`
- `components/topbar.html`

`js/components.js` loads them and updates the current player's top bar.

## Database files

Keep every database change as a numbered SQL migration. This makes it clear what has already been installed and prevents losing database setup instructions between ZIP versions.
