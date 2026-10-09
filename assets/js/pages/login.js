/** Direct port of src/app/login/page.tsx, plus the is_active/role gate the
 * client app's own login does (see assets/js/auth.js's header comment). */
import { supabase } from "../supabase-client.js";
import { getSignedInUser } from "../auth.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const errorEl = document.getElementById("login-error");
const submitBtn = document.getElementById("login-submit");

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function goToLandingPage(user) {
  window.location.href = user.tier === "admin" ? "/dashboard/overview.html" : "/rancher.html";
}

// Already signed in with a valid, active profile? Skip the form entirely.
getSignedInUser().then((user) => {
  if (user) goToLandingPage(user);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  // Same account as public/client-app (John's office app) -- this is the
  // client's own Supabase project, not a separate signup.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passwordInput.value,
  });

  if (signInError) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
    showError("Incorrect email or password.");
    return;
  }

  const user = await getSignedInUser();
  if (!user) {
    await supabase.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in";
    showError("Your account is not active, or has no recognized role yet. Ask John to activate it.");
    return;
  }

  goToLandingPage(user);
});
