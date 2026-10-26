# YouTube Metadata Exporter

A simple YouTube metadata ingestion tool that extracts video metadata from a YouTube channel and exports it to an Excel spreadsheet. Simply paste a YouTube channel URL to retrieve the channel's videos and export the results.

![YouTube Metadata Exporter](docs/YME.png)
![Excel](docs/excel.png)

## Get a YouTube API Key

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and sign in.
2. **Create a project:** Open the project selector, select **New Project**, and click **Create**. Make sure the new project is selected.
3. **Enable the API:** Open the [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) page and click **Enable**.
4. **Create an API key:** Open [Credentials](https://console.cloud.google.com/apis/credentials), select **Create Credentials**, and choose **API key**.
5. **Copy your API key** for use when running the application.

### Configure API Key Restrictions

On the API key's edit page:

- **API restrictions:** Select **Restrict key** and choose **YouTube Data API v3**.
- **Application restrictions:** Select **None**. The application makes YouTube API requests from the server, so browser-based website restrictions would block those requests.

## Run the Application

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A YouTube API key from the steps above

### Start & Sop

F

```sh

# clone repo and CD

git clone https://github.com/bekcsys/youtubemetadata2excel.git
cd youtubemetadata2excel

# starts services 
make run

# The first time, it asks for your YouTube API key and the email on the Google account that owns that key. Later runs reuse the saved key. Press Enter to keep the saved email.

# When it finishes, open [http://localhost:3000](http://localhost:3000).

# stops all services 
make stop
```




