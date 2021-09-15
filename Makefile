PRODUCTION_URL := https://press.collected.workers.dev

production:
	wrangler publish

staging:
	wrangler preview

health:
	@curl -w '\n Latency: %{time_total}s\n' $(PRODUCTION_URL)/health
