package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const updateCheckTimeout = 3 * time.Second

var (
	appVersion     = "dev"
	releaseFeedURL = "https://api.github.com/repos/b1tAction/paraweb/releases/latest"
)

// App is the Wails application lifecycle container.
type App struct{}

// UpdateCheckResult describes the result of checking GitHub Releases.
type UpdateCheckResult struct {
	CurrentVersion string `json:"current_version"`
	LatestVersion  string `json:"latest_version"`
	HasUpdate      bool   `json:"has_update"`
	ReleaseURL     string `json:"release_url"`
}

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

// NewApp creates the Wails application instance.
func NewApp() *App {
	return &App{}
}

func (a *App) startup(_ context.Context) {}

func (a *App) shutdown(_ context.Context) {}

func currentAppVersion() (string, bool) {
	version := strings.TrimSpace(appVersion)
	if version == "" {
		version = "dev"
	}

	return version, version == "dev"
}

// CheckForUpdate compares the current desktop version with the latest GitHub Release.
func (a *App) CheckForUpdate() (UpdateCheckResult, error) {
	currentVersion, isDevVersion := currentAppVersion()
	result := UpdateCheckResult{
		CurrentVersion: currentVersion,
	}

	if isDevVersion {
		return result, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), updateCheckTimeout)
	defer cancel()

	release, err := fetchLatestRelease(ctx)
	if err != nil {
		return result, err
	}

	latestVersion := strings.TrimSpace(release.TagName)
	if latestVersion == "" {
		return result, fmt.Errorf("latest release tag is empty")
	}

	result.LatestVersion = latestVersion
	result.ReleaseURL = strings.TrimSpace(release.HTMLURL)
	result.HasUpdate = latestVersion != currentVersion

	return result, nil
}

func fetchLatestRelease(ctx context.Context) (githubRelease, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, releaseFeedURL, nil)
	if err != nil {
		return githubRelease{}, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "ParaDiced")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return githubRelease{}, err
	}
	defer func() {
		_ = response.Body.Close()
	}()

	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return githubRelease{}, fmt.Errorf("latest release request returned HTTP %d", response.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&release); err != nil {
		return githubRelease{}, err
	}

	return release, nil
}
