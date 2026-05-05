#!/bin/sh
set -e

cat > .env.local <<'EOF'
VITE_GET_INVENTORY_URL=https://34xbqtq7tizy7vdtwxvt25o6ma0pccoc.lambda-url.eu-central-1.on.aws/
VITE_UPSERT_INVENTORY_URL=https://3u6yb64vw2ejvmiptnu3zkuely0azlhc.lambda-url.eu-central-1.on.aws/
VITE_DELETE_INVENTORY_URL=https://2vbtklghhrghr5p667wqwjjgni0vccsc.lambda-url.eu-central-1.on.aws/
VITE_GET_ALERTS_URL=https://l55aywa5y6bhkzzlzgkdh5zwr40dabdb.lambda-url.eu-central-1.on.aws/
VITE_UPDATE_ALERT_STATUS_URL=https://fj2txv7kkiwiicphrp57wq6oz40nxopu.lambda-url.eu-central-1.on.aws/
VITE_UPSERT_ALERT_URL=https://s2hh7swqwzzf7lc46bci4qujoy0sfyos.lambda-url.eu-central-1.on.aws/
VITE_GET_PURCHASES_URL=https://eur3naprmc5wuekxtl3jasubym0ytjyy.lambda-url.eu-central-1.on.aws/
VITE_UPSERT_PURCHASE_URL=https://fmq6os3ead4ayfg2voqlw7boka0kofwf.lambda-url.eu-central-1.on.aws/
VITE_GET_PROPERTIES_URL=https://cbs7wsef6nqhqyxgu3zszt6yvu0lesml.lambda-url.eu-central-1.on.aws/
VITE_UPSERT_PROPERTY_URL=https://njmwxmszj3utxrysebf7o6rfmi0bcecm.lambda-url.eu-central-1.on.aws/
VITE_DELETE_PROPERTY_URL=https://w6bc7itpfg4kttw44wilwnn4dq0kugzy.lambda-url.eu-central-1.on.aws/
VITE_EXTERNAL_PROPERTIES_PROXY_URL=https://rifyhzjyp6xzb7gan443njew4q0lxdeb.lambda-url.eu-central-1.on.aws/
EOF

echo ".env.local created."
