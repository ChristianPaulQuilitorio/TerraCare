import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { SiteConfigService } from '../../core/services/site-config.service';

@Component({
  selector: 'app-knowledge',
  standalone: true,
  imports: [NavbarComponent, CommonModule],
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class KnowledgeComponent {
  items = this.siteConfig.knowledgeItems;
  constructor(private siteConfig: SiteConfigService) {}
}
