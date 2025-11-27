import { Component, ElementRef, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-plantings-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plantings-chart-root">
      <canvas #canvasEl height="120"></canvas>
      <div *ngIf="!chartAvailable" class="muted small">Chart library not loaded. Run: npm install chart.js to enable interactive chart.</div>
    </div>
  `,
  styles: [`
    .plantings-chart-root { width: 100%; }
    canvas { width: 100% !important; max-height: 240px; }
  `],
  encapsulation: ViewEncapsulation.None
})
export class PlantingsChartComponent implements OnInit {
  chartAvailable = false;
  private chart: any = null;

  constructor(private el: ElementRef, private http: HttpClient) {}

  async ngOnInit() {
    try {
      const resp: any = await this.http.get('/api/metrics/plantings-timeseries').toPromise().catch(() => null);
      const series = (resp && resp.series) || [];

      const labels = series.map((s: any) => s.month);
      const data = series.map((s: any) => Number(s.count || 0));

      // Dynamic import Chart.js to avoid hard dependency until installed
      try {
        const ChartModule = await import('chart.js/auto');
        const Chart = ChartModule.default || ChartModule;
        this.chartAvailable = true;
        const canvas: HTMLCanvasElement | null = this.el.nativeElement.querySelector('canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        // eslint-disable-next-line no-unused-vars
        this.chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Plantings', data, backgroundColor: 'rgba(40,167,69,0.7)', borderColor: 'rgba(40,167,69,1)', borderWidth: 1 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { ticks: { maxRotation: 0 } }, y: { beginAtZero: true } }
          }
        });
      } catch (e) {
        this.chartAvailable = false;
      }
    } catch (e) {
      // ignore
    }
  }
}
