import { router } from 'expo-router';

import { FlockListScreen } from '@/modules/operations';

export default function FlocksRoute() {
  return (
    <FlockListScreen
      onCreate={() => router.push('/flocks/new')}
      onOpen={(id) => router.push({ pathname: '/flocks/[id]', params: { id } })}
    />
  );
}
