// Curated poster images for the seeded demo titles. Matching is a
// case-insensitive "does the title contain this keyword" check, so it still
// works if an organiser lists a show with a slightly different title (e.g.
// "Hamlet — Live" still matches "hamlet"). This is only ever a fallback —
// an organiser-uploaded poster (event.poster_url) always wins over this.
const CURATED_POSTERS = [
  { match: 'jawan', url: 'https://upperstall.com/wp-content/uploads/2023/09/Jawan-Header.jpg' },
  { match: 'rocky aur rani', url: 'https://jiotvimages.cdn.jio.com/imagespublic/metadata/08780059e2e3e61069f4bd3b8cc911c3.jpg' },
  { match: 'gangubai', url: 'https://static.toiimg.com/photo/89414066.jpeg' },
  { match: '12th fail', url: 'https://cdn.district.in/movies-assets/images/cinema/Horizontal-12th-fail-d04981a0-50e0-11f0-9951-6bd98bb9c412.jpg?im=Resize,width=720' },
  { match: 'karan aujla', url: 'https://images.perthnow.com.au/publication/C-22717969/754e59dad5afd9448147ad02b08d0f584a9aa3e8-4x3-x0y0w4032h3024.jpg' },
  { match: 'arijit singh', url: 'https://mir-s3-cdn-cf.behance.net/projects/404/4b6998253868907.Y3JvcCwzMDQwLDIzNzgsMjQ4LDE2NTU.png' },
  { match: 'diljit', url: 'https://i.ytimg.com/vi/cs2pEo-wYAo/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLCBxvwtMow-1087xKkgnVSj6zttjg' },
  { match: 'shreya ghoshal', url: 'https://www.theindianpanorama.news/wp-content/uploads/2022/10/Shreya-ghoshal.jpg' },
  { match: 'mahabharat', url: 'https://miro.medium.com/1*siJ6JBW32jmuCIj6Z-vg-A.png' },
  { match: 'ramayana', url: 'https://media.istockphoto.com/id/1213718422/vector/lord-rama-with-his-wife-sita-and-brother-laxman-illustration.jpg?s=612x612&w=0&k=20&c=7HK6sk_ipDvWCOyKPpQe7oy3f-BnUWyeitPP_SjgfrA=' },
  { match: 'hamlet', url: 'https://t3.ftcdn.net/jpg/08/16/24/02/360_F_816240278_He88RKDKxqJ9w82zIYvQ36SbYo3kRe3t.jpg' },
];

export function getCuratedPoster(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  const found = CURATED_POSTERS.find((p) => t.includes(p.match));
  return found ? found.url : null;
}
