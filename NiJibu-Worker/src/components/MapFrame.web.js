// Browser (testing only): a plain iframe
export default function MapFrame({ uri }) {
  return <iframe title="map" src={uri} style={{ border: 0, width: '100%', height: '100%' }} />;
}
