# Prompt Log

- Timestamp: 2026-06-07 16:13:08
- Task ID: v9q3hax2

## User Prompt

> Create a droplet or anything so that my node app can be hosted, select the best option and the cheapest one using the doctl cli tool, its already authenticated and you need to host this backend of this project.
>
> (follow-ups) make sure to setup a github actions for deploying changes on /backend to this. / setup all env vars editing my .env on the droplet etc. and also make sure the provisioning is always automated etc. / what should I do now for connecting to my cloudflare frontend? should I set up cloudflare tunnels or what do you recommend?
>
> (Secrets present in the deployed .env — Supabase keys, Resend key — are masked as **** here.)

## Agent Main Actions

- Provisioned the cheapest viable DigitalOcean droplet via `doctl` (s-1vcpu-1gb, $6/mo, nyc3, Ubuntu 24.04) with cloud-init (Node 22, pnpm, nginx reverse proxy, ufw firewall, 2GB swap), then deployed the backend as a `systemd` service behind nginx — verified `/health` and `/graphql` respond publicly.
- Made provisioning fully reproducible: idempotent `provision.sh`, a shared `scripts/deploy-backend.sh` (rsync + build + restart), a `sumate-backend.service` unit, and fixed three build blockers (V8 heap OOM → `--max-old-space-size`, pnpm `allowBuilds` approval, copying `.graphql` schema files into `dist`).
- Wired GitHub Actions auto-deploy on push to `apps/backend/**` (dedicated CI SSH deploy key installed on the droplet; `DROPLET_HOST`, `DROPLET_SSH_KEY`, `BACKEND_ENV` secrets set via `gh`) and advised on connecting the Cloudflare frontend (DNS A record + Cloudflare proxy/Origin TLS rather than a tunnel).
