package main

import "context"

// App is the Wails application lifecycle container.
type App struct {
	ctx context.Context
}

// NewApp creates the Wails application instance.
func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {}
