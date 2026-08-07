/* App configuration — the only file to edit when wiring the hosted services.
   These values are public-by-design (they ship to every browser anyway); the
   only real secret is the Firebase service-account JSON, which lives in
   GitHub Actions. Run `python3 tools/configure.py` for a guided setup, or
   edit by hand. */
window.HKR_CONFIG = {
  /* Firebase web-app config object (Firebase console → Project settings →
     Your apps). While null, the app runs fully functional in local/demo
     mode — progress stays on-device, contributions queue locally. */
  FIREBASE_CONFIG: null,
  /* "owner/repo", e.g. "marcuskidan/waihona" — powers the
     public map-history link. */
  GITHUB_REPO: "",
};
