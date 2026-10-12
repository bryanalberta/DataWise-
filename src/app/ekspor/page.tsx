'use client';

import React from 'react';
import { ExportStudio } from '@/components/ExportStudio';
import { Dataset } from '@/types';

export interface EksporPageProps {
  readonly _testDataset?: Dataset | null;
}

export default function EksporPage({ _testDataset }: EksporPageProps = {}) {
  return <ExportStudio _testDataset={_testDataset} />;
}

