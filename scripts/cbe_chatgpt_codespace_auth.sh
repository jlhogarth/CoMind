#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile_dir="${CBE_PROFILE_DIR:-/workspaces/.comind-chatgpt-profile}"
display_number="${CBE_DISPLAY:-:99}"
novnc_port="${CBE_NOVNC_PORT:-6080}"

case "${profile_dir}" in
  "${repository_root}"|"${repository_root}"/*)
    echo "Refusing to place the authenticated ChatGPT browser profile inside the repository." >&2
    exit 2
    ;;
esac

mkdir -p "${profile_dir}"
chmod 700 "${profile_dir}"

cleanup() {
  for pid in "${websockify_pid:-}" "${vnc_pid:-}" "${openbox_pid:-}" "${xvfb_pid:-}"; do
    if [[ -n "${pid}" ]]; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT INT TERM

cd "${repository_root}/server"
npx playwright install --with-deps chromium
npm run build

Xvfb "${display_number}" -screen 0 1440x900x24 -nolisten tcp >"${profile_dir}/xvfb.log" 2>&1 &
xvfb_pid=$!
export DISPLAY="${display_number}"

for attempt in $(seq 1 50); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 50 ]]; then
    echo "Xvfb did not become ready." >&2
    exit 1
  fi
  sleep 0.1
done

openbox-session >"${profile_dir}/openbox.log" 2>&1 &
openbox_pid=$!

x11vnc \
  -display "${DISPLAY}" \
  -localhost \
  -forever \
  -shared \
  -nopw \
  -rfbport 5900 \
  >"${profile_dir}/x11vnc.log" 2>&1 &
vnc_pid=$!

websockify \
  --web=/usr/share/novnc \
  "127.0.0.1:${novnc_port}" \
  127.0.0.1:5900 \
  >"${profile_dir}/websockify.log" 2>&1 &
websockify_pid=$!

printf '\nCBE ChatGPT authentication browser is starting on private forwarded port %s.\n' "${novnc_port}"
printf 'In the Codespace Ports panel, open port %s and keep its visibility Private.\n' "${novnc_port}"
printf 'Complete normal ChatGPT sign-in and MFA only inside that visible browser.\n'
printf 'Do not paste passwords, MFA values, cookies, or tokens into the terminal.\n'
printf 'Successful sign-in is detected automatically.\n\n'

export CBE_PROFILE_DIR="${profile_dir}"
node scripts/cbe-chatgpt-codespace-auth.mjs
