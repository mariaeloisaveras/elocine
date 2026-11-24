import { ApplicationConfig, inject } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { CatalogRepository, PlaybackRepository } from './domain/media';
import { HttpCatalogRepository, HttpPlaybackRepository } from './infrastructure/http.repositories';
import { CatalogUseCases } from './application/catalog.use-cases';
import { PlaybackUseCases } from './application/playback.use-cases';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      [
        {
          path: '',
          title: 'Elocine — Seu próximo play',
          loadComponent: () => import('./presentation/home/home.page').then((m) => m.HomePage),
        },
        {
          path: 'platform/:platform',
          loadComponent: () =>
            import('./presentation/catalog/catalog.page').then((module) => module.CatalogPage),
        },
        {
          path: 'browse/:kind',
          loadComponent: () =>
            import('./presentation/catalog/catalog.page').then((module) => module.CatalogPage),
        },
        {
          path: 'watch/:kind/:id',
          loadComponent: () => import('./presentation/watch/watch.page').then((m) => m.WatchPage),
        },
        { path: '**', redirectTo: '' },
      ],
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    { provide: CatalogRepository, useClass: HttpCatalogRepository },
    { provide: PlaybackRepository, useClass: HttpPlaybackRepository },
    { provide: CatalogUseCases, useFactory: () => new CatalogUseCases(inject(CatalogRepository)) },
    {
      provide: PlaybackUseCases,
      useFactory: () => new PlaybackUseCases(inject(PlaybackRepository)),
    },
  ],
};
