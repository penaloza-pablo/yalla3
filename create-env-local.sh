#!/bin/sh
set -e

cat > .env.local <<'EOF'
VITE_GET_INVENTORY_URL=https://34xbqtq7tizy7vdtwxvt25o6ma0pccoc.lambda-url.eu-central-1.on.aws/
VITE_UPSERT_INVENTORY_URL=https://3u6yb64vw2ejvmiptnu3zkuely0azlhc.lambda-url.eu-central-1.on.aws/
VITE_GET_ALERTS_URL=https://l55aywa5y6bhkzzlzgkdh5zwr40dabdb.lambda-url.eu-central-1.on.aws/
VITE_UPDATE_ALERT_STATUS_URL=https://fj2txv7kkiwiicphrp57wq6oz40nxopu.lambda-url.eu-central-1.on.aws/
VITE_UPSERT_ALERT_URL=https://s2hh7swqwzzf7lc46bci4qujoy0sfyos.lambda-url.eu-central-1.on.aws/
VITE_GET_PURCHASES_URL=
VITE_UPSERT_PURCHASE_URL=
EOF

echo ".env.local created."
