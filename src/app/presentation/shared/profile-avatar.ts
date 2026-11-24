import { Component, input } from '@angular/core';
import { PROFILE_AVATARS, ProfileAvatar as Avatar } from '../../domain/profile-avatar';

@Component({
  selector: 'profile-avatar',
  standalone: true,
  template:
    '<span [style.background]="avatar().background" aria-hidden="true">{{ avatar().icon }}</span>',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      span {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        font-size: inherit;
        font-weight: 800;
        line-height: 1;
      }
    `,
  ],
})
export class ProfileAvatar {
  readonly avatar = input<Avatar>(PROFILE_AVATARS[0]);
}
