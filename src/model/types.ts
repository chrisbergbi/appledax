export interface ModelTranslation {
  culture: string;
  caption?: string;
  description?: string;
  displayFolder?: string;
}

export interface ModelColumn {
  name: string;
  dataType: string;
  description?: string;
  isCalculated?: boolean;
  isHidden?: boolean;
  translations?: ModelTranslation[];
}

export interface ModelMeasure {
  name: string;
  expression: string;
  formatString?: string;
  displayFolder?: string;
  description?: string;
  translations?: ModelTranslation[];
}

export interface ModelTable {
  name: string;
  columns: ModelColumn[];
  measures: ModelMeasure[];
  isHidden?: boolean;
  translations?: ModelTranslation[];
}

export interface ModelRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  crossFilteringBehavior?: 'oneDirection' | 'bothDirections';
  isActive?: boolean;
}

export interface DataModel {
  tables: ModelTable[];
  relationships: ModelRelationship[];
}
