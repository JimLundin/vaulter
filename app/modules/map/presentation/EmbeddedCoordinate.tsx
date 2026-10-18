import type { CoordinateRecord } from '@/modules/map/reading.ts';
import { decimalDegrees, spatialQualificationLabel } from '@/modules/map/coordinates.ts';
import { MapView, Stack, Text } from '@/shared/ui/kit/index.ts';

export function EmbeddedCoordinate({ record }: { record: CoordinateRecord }) {
  const latitude = decimalDegrees(record.coordinates.latitude);
  const longitude = decimalDegrees(record.coordinates.longitude);
  return (
    <Stack>
      <Text>
        Location · {latitude}, {longitude}
      </Text>
      {!!record.coordinates.qualification && (
        <Text tone="muted">{spatialQualificationLabel(record.coordinates.qualification)}</Text>
      )}
      <MapView
        onSelect={() => undefined}
        markers={[{ id: 'embedded', label: 'Location', latitude, longitude }]}
      />
    </Stack>
  );
}
