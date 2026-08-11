import ObjectBox

// objectbox: entity
class VectorEntity {
    var id: Id = 0
    
    // objectbox: annotation = HnswIndex(dimensions: 768, distanceType: VectorDistanceType.cosine)
    var embedding: [Float]?
    var metadata: String?
    var workspaceSlug: String?
    
    init() {}
}
