import { serveRequest } from "../src/index";

export default {
    async fetch(request: Request) {
        return await serveRequest("RoyalIcing", "RoyalIcing", new URL(request.url));
    }
}
