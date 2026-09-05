NiCE Cognigy logo lockups — vendored from the official brand package
(NiCE Branding / NiCE-Cognigy-logo / SVG), unmodified.

  cognigy-white-and-blue.svg          horizontal, for dark surfaces (the rail)
  cognigy-black-and-blue.svg          horizontal, for light surfaces
  cognigy-stacked-white-and-blue.svg  stacked, for narrow/dark surfaces

They live in the repo because a clone (and an installer) must be able to
render the brand without reaching outside the tree. extension/brand/ holds
its own copy: an MV3 extension page cannot read files from this folder.

DO NOT INLINE TWO OF THESE INTO THE SAME DOCUMENT. Each carries an internal
<style> block using generic class names, and white-and-blue and black-and-blue
both define .cls-1 { fill: #3694fc }. Inlined, those rules become
document-global and silently recolour each other. Reference them with
background-image or <img src>, which scope the styles to the SVG's own
document.

The lockups are NiCE/Cognigy trademarks. Internal use; do not alter the
artwork, recolour it, or change its proportions.
