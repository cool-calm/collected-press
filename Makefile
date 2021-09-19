PRODUCTION_URL := https://press.collected.workers.dev
CURL_TRAIL := '\n\n Status: %{http_code} \n Latency: %{time_total}s\n'

production:
	wrangler publish

staging:
	wrangler publish --env staging

preview:
	wrangler preview --watch --url "https://example.com/health"

GET_health:
	@curl -w $(CURL_TRAIL) $(PRODUCTION_URL)/health
	httpstat $(PRODUCTION_URL)/health

GET_yieldmachine_readme:
	@curl -w $(CURL_TRAIL) $(PRODUCTION_URL)/1/github/RoyalIcing/yieldmachine@4478530fc40c3bf1208f8ea477f455ad34da308d/readme.md

GET_yieldparser_readme:
	@curl -w $(CURL_TRAIL) $(PRODUCTION_URL)/1/github/RoyalIcing/yieldparser@71cb0f1f0a2732bcf8da0f0c94417c749b2003f0/README.md

GET_gist:
	@curl -w $(CURL_TRAIL) $(PRODUCTION_URL)/1/github/gist/gaearon/e7d97cdf38a2907924ea12e4ebdf3c85

GET_not_found:
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/404

GET_not_found_valid_repo:
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/RoyalIcing/yieldparser@71cb0f1f0a2732bcf8da0f0c94417c749b2003f0/INVALID.md

GET_github_rate_limit:
	@curl -s https://api.github.com/rate_limit
	httpstat https://api.github.com/rate_limit

GET_github_org_repos:
	@curl -s https://api.github.com/orgs/RoyalIcing/repos | jq ".[] | .name"

GET_github_emojis:
	@curl -s https://api.github.com/emojis

GET_github_gist:
	curl -H "Accept: application/vnd.github.v3+json" "https://api.github.com/gists/e7d97cdf38a2907924ea12e4ebdf3c85"

GET_github_refs:
	httpstat "https://github.com/RoyalIcing/yieldmachine.git/info/refs?service=git-upload-pack"

GET_yieldmachine_refs:
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/RoyalIcing/yieldmachine/refs
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/RoyalIcing/yieldmachine/refs/heads/master

GET_yieldmachine_files:
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/RoyalIcing/yieldmachine/
	# @curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/RoyalIcing/yieldmachine/

GET_react_refs:
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/facebook/react/refs/heads/main
	@curl -w $(CURL_TRAIL) -i $(PRODUCTION_URL)/1/github/facebook/react/refs/tags
