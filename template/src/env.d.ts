/** The host's deploy context at build time: production, deploy-preview, branch-deploy or local. */
declare const __DEPLOY_CONTEXT__: string
/** The backend's address; empty in every build but production (G-0019). */
declare const __BACKEND_URL__: string
