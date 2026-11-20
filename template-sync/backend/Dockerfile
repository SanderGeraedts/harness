# The backend (D-0008): PocketBase with this project's schema and hooks baked in. The
# backend workflow builds it, proves it on an empty database, and publishes it from main.
# PocketBase is pre-1.0: read its changelog before raising the version, and treat a new
# version like a schema change.
FROM ghcr.io/muchobien/pocketbase:0.40.6
COPY pb_migrations /pb_migrations
COPY pb_hooks /pb_hooks
# Links the published image to its repository. The workflow passes the repository's address,
# so none is written here.
ARG SOURCE=""
LABEL org.opencontainers.image.source="${SOURCE}"
