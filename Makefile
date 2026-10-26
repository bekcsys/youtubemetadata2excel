.PHONY: help run stop

help:
	@echo "Youtube Metadata exporter"
	@echo ""
	@echo "  make run     Start the app. Asks for a YouTube API key if none is saved,"
	@echo "               and asks which email that key belongs to."
	@echo "  make stop    Stop the app."
	@echo "  make help    Show this help."

run:
	@sh scripts/run.sh

stop:
	@sh scripts/stop.sh
