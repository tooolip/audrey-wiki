export default {
	async fetch() {
		return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
	},
} satisfies ExportedHandler;
