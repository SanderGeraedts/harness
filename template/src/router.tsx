import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { EditItemPage, NewItemPage } from './routes/ItemForm'
import { ItemList } from './routes/ItemList'
import { ItemPage } from './routes/ItemPage'
import { Layout } from './routes/Layout'
import { NotFound } from './routes/NotFound'

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFound })

const listRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ItemList })

// D-0005 (G-0021): items are addressed by their slug, never their id. A static segment
// outranks $slug, so /items/new is the form; `new` is never a slug (src/db/slug.ts).
const newItemRoute = createRoute({ getParentRoute: () => rootRoute, path: '/items/new', component: NewItemPage })
const itemRoute = createRoute({ getParentRoute: () => rootRoute, path: '/items/$slug', component: ItemPage })
const editItemRoute = createRoute({ getParentRoute: () => rootRoute, path: '/items/$slug/edit', component: EditItemPage })

// D-0003: /design exists in every build but production. __DEPLOY_CONTEXT__ is replaced at
// build time, so in production this branch and the page's chunk are dropped.
const designRoutes =
  __DEPLOY_CONTEXT__ !== 'production'
    ? [
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/design',
          component: lazyRouteComponent(() => import('./routes/DesignPage'), 'DesignPage'),
        }),
      ]
    : []

const routeTree = rootRoute.addChildren([listRoute, newItemRoute, itemRoute, editItemRoute, ...designRoutes])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
