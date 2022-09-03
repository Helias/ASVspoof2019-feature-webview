import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { PlotlyService } from 'angular-plotly.js';
import { PlotData, PlotlyDataLayoutConfig } from 'plotly.js-dist-min';
import { BehaviorSubject, combineLatest, from, shareReplay, Subject, tap } from 'rxjs';
import { filter, switchMap, takeUntil } from 'rxjs/operators';
import { PlaygroundService } from '../../services/playground.service';
import { Dataset, DATASETS, SYNTHETIC_LABELS } from '../home/home.model';

@Component({
  selector: 'app-playground',
  templateUrl: './playground.component.html',
  styleUrls: ['./playground.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaygroundComponent implements OnDestroy {
  private _dataset: Dataset = DATASETS[1];
  @Input() set dataset(dataset: Dataset) {
    this.readyLabels.next(false);
    this._dataset = dataset;
    this.initDataset();
  }

  private _feature = 'bitrate';
  @Input() set feature(feature: string) {
    this._feature = feature;
    this.refresh$.next(feature);
  }
  get feature(): string {
    return this._feature;
  }

  private _grouped = true;
  @Input() set grouped(grouped: boolean) {
    this._grouped = grouped;
    this.refresh$.next(grouped);
  }

  @ViewChild('chart') plotlyGraph: any;

  isLoading = true;

  constructor(
    private playgroundService: PlaygroundService,
    private readonly cdRef: ChangeDetectorRef,
    private readonly plotly: PlotlyService,
  ) {
    this.initGraph();
  }

  private readonly sharedPlotParam = { x: [0], y: [0], type: 'scatter' as PlotData['type'], mode: 'lines' as PlotData['mode'], name: '' };
  private readonly unsubscribe$ = new Subject();
  private readonly readyLabels = new BehaviorSubject<boolean>(false);
  private readonly refresh$ = new Subject();
  private labels: string[];

  graph: PlotlyDataLayoutConfig = {
    data: [
      { ...this.sharedPlotParam, marker: { color: 'blue' } },
      { ...this.sharedPlotParam, marker: { color: 'red' } },
    ],
    layout: { width: 800, height: 600, dragmode: 'pan', title: { text: `${this._dataset} - ${this.feature}`, xanchor: 'center' } },
    config: { scrollZoom: true },
  };

  private initDataset(): void {
    this.playgroundService
      .getDataFromCsvZip(this._dataset, 'label')
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((labels) => {
        this.labels = labels;
        this.readyLabels.next(true);
      });
  }

  private initGraph(): void {
    combineLatest([this.readyLabels, this.refresh$])
      .pipe(
        tap(() => {
          this.isLoading = true;
        }),
        filter(([ready, _]) => !!ready),
        switchMap((_) => from(this.playgroundService.getDataFromCsvZip(this._dataset, this.feature))),
        shareReplay(1),
        takeUntil(this.unsubscribe$),
      )
      .subscribe((feature) => {
        this.isLoading = false;
        const realData: number[] = [];
        const fakeData: number[] = [];
        for (let i = 0; i < this.labels.length; i++) {
          if (SYNTHETIC_LABELS.includes(this.labels[i])) {
            fakeData.push(Number(feature[i]));
          } else {
            realData.push(Number(feature[i]));
          }
        }

        const getData = this._grouped ? this.playgroundService.elaborateData : this.playgroundService.elaborateDataV2;
        const { x: xReal, y: yReal } = getData.bind(this.playgroundService)(realData);
        const { x: xFake, y: yFake } = getData.bind(this.playgroundService)(fakeData);

        (this.graph.data[0] as Partial<PlotData>).x = xReal;
        (this.graph.data[0] as Partial<PlotData>).y = yReal;
        this.graph.data[0].name = `real (${realData.length})`;
        (this.graph.data[1] as Partial<PlotData>).x = xFake;
        (this.graph.data[1] as Partial<PlotData>).y = yFake;
        this.graph.data[1].name = `synthetic (${fakeData.length})`;

        this.cdRef.detectChanges();

        this.autoscale();
      });
  }

  private autoscale(): void {
    this.plotly.getPlotly().then((plotly) => {
      plotly.relayout(this.plotlyGraph.plotEl.nativeElement, {
        'xaxis.autorange': true,
        'yaxis.autorange': true,
        title: { text: `${this._dataset} - ${this.feature}`, xanchor: 'center' },
      });
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next(null);
    this.unsubscribe$.complete();
  }
}
