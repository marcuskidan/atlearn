/* App configuration — the only file to edit when wiring the hosted services.
   These values are public-by-design (they ship to every browser anyway); the
   only real secret is the Firebase service-account JSON, which lives in
   GitHub Actions. Edit the two values below by hand — see DEPLOY.md. */
window.HKR_CONFIG = {
  /* Firebase web-app config object (Firebase console → Project settings →
     Your apps). Public-by-design — it ships to every browser. While null,
     the app runs fully functional in local/demo mode.
     (measurementId omitted on purpose: Analytics is never loaded.) */
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyB0FEZvt7vYAFpaqTrrcbvn9DEZLYY1tQk",
    authDomain: "atlearn-62281.firebaseapp.com",
    projectId: "atlearn-62281",
    storageBucket: "atlearn-62281.firebasestorage.app",
    messagingSenderId: "93847184442",
    appId: "1:93847184442:web:e425391d5e0f6cd205c103",
  },
  /* "owner/repo" — powers the public map-history link.
     (Still the pre-rename repo path; update when the repo becomes
     marcuskidan/atlearn on GitHub.) */
  GITHUB_REPO: "marcuskidan/atlearn",
};
