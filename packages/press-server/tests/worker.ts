import { serveRequest } from "../src/index";

export default {
    async fetch(request: Request) {
        const { pathname } = new URL(request.url);
        return await serveRequest("RoyalIcing", "RoyalIcing", pathname);
    }
}
