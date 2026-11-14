#!/usr/bin/env bash
# One-time Google Cloud setup for deploying Bekem from GitHub. Safe to run again.
# Run it in Cloud Shell (console.cloud.google.com → the >_ icon top right):
#   bash setup_gcp.sh
# No key is created: GitHub signs in with Workload Identity Federation, and Google only accepts
# requests that come from the GitHub repository below.
set -euo pipefail

PROJECT=bekem-514710
REPO=muslimtaishiev-beep/dwoggle
RUNTIME=bekem-api@$PROJECT.iam.gserviceaccount.com          # what the backend runs as (exists already)
DEPLOYER_NAME=bekem-deployer
DEPLOYER=$DEPLOYER_NAME@$PROJECT.iam.gserviceaccount.com     # what GitHub Actions deploys as
POOL=github
PROVIDER=dwoggle

gcloud config set project "$PROJECT" --quiet >/dev/null
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
BUILDER=$NUMBER-compute@developer.gserviceaccount.com        # Cloud Build builds the image as this account

retry() {  # a just-created service account takes up to a minute to exist everywhere in Google
  for attempt in 1 2 3 4 5 6; do
    if "$@" >/dev/null 2>"$HOME/.bekem_err"; then return 0; fi
    if grep -q "does not exist" "$HOME/.bekem_err" && [ "$attempt" -lt 6 ]; then
      echo "  … Google is still creating it, waiting 15 s (try $attempt/6)"
      sleep 15
    else
      cat "$HOME/.bekem_err" >&2
      return 1
    fi
  done
}

grant() {  # grant ROLE to MEMBER on the project, quietly
  retry gcloud projects add-iam-policy-binding "$PROJECT" --member="$1" --role="$2" --condition=None --quiet
  echo "  ✓ $2 → ${1#serviceAccount:}"
}

echo "1/6 Turning on the services (needs the Blaze plan, see DEPLOY_FIREBASE.md step 1) ..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firebasehosting.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com \
  earthengine.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --quiet
echo "  ✓ done"

echo "2/6 Backend identity ($RUNTIME): Earth Engine, Firestore, Firebase Auth ..."
for role in roles/earthengine.viewer roles/serviceusage.serviceUsageConsumer roles/datastore.user roles/firebaseauth.admin; do
  grant "serviceAccount:$RUNTIME" "$role"
done

echo "3/6 Deploy identity for GitHub ($DEPLOYER) ..."
gcloud iam service-accounts describe "$DEPLOYER" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$DEPLOYER_NAME" --display-name="Bekem: GitHub deploy" --quiet
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.admin roles/storage.admin \
            roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer roles/viewer; do
  grant "serviceAccount:$DEPLOYER" "$role"
done
for sa in "$RUNTIME" "$BUILDER"; do
  retry gcloud iam service-accounts add-iam-policy-binding "$sa" --member="serviceAccount:$DEPLOYER" \
    --role=roles/iam.serviceAccountUser --quiet
  echo "  ✓ may act as ${sa}"
done

echo "4/6 Cloud Build may build and push the image ..."
grant "serviceAccount:$BUILDER" roles/run.builder

echo "5/6 Keyless sign-in for GitHub repo $REPO ..."
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions" --quiet
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
    --display-name="dwoggle repo" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'" --quiet
retry gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" --quiet
echo "  ✓ only $REPO may deploy as $DEPLOYER"

echo "6/6 Deleting any old keys of $DEPLOYER (they are not needed any more) ..."
for key in $(gcloud iam service-accounts keys list --iam-account="$DEPLOYER" --managed-by=user --format='value(name)'); do
  gcloud iam service-accounts keys delete "$key" --iam-account="$DEPLOYER" --quiet
  echo "  ✓ deleted key ${key##*/}"
done

echo
echo "All set. Project number: $NUMBER (the GitHub workflow expects 848548003400)."
[ "$NUMBER" = "848548003400" ] || echo "!! Project number differs: tell your backend developer to update .github/workflows/deploy-firebase.yml"
