import Foundation
import ObjectBox

@objc(VectorBox)
class VectorBox: NSObject {
    private var store: Store?
    private var box: Box<VectorEntity>?

    override init() {
        super.init()
        do {
            let directory = try Store.defaultDirectoryURL()
            store = try Store(directoryPath: directory.path)
            box = store?.box(for: VectorEntity.self)
        } catch {
            print("Failed to initialize ObjectBox: \(error)")
        }
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func insert(_ embeddingArray: NSArray, metadata: String, workspaceSlug: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        let entity = VectorEntity()
        entity.embedding = embeddingArray as? [Float]
        entity.metadata = metadata
        entity.workspaceSlug = workspaceSlug
        do {
            let id = try box.put(entity)
            resolve(Int(id))
        } catch {
            reject("INSERT_ERROR", error.localizedDescription, error)
        }
    }

    @objc func bulkInsert(_ embeddings: NSArray, metadatas: NSArray, workspaceSlug: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        var entities: [VectorEntity] = []
        for i in 0..<embeddings.count {
            let entity = VectorEntity()
            entity.embedding = embeddings[i] as? [Float]
            entity.metadata = metadatas[i] as? String
            entity.workspaceSlug = workspaceSlug
            entities.append(entity)
        }
        do {
            let ids = try box.put(entities)
            resolve(ids.map { Int($0) })
        } catch {
            reject("BULK_INSERT_ERROR", error.localizedDescription, error)
        }
    }

    @objc func search(_ embedding: NSArray, workspaceSlug: String, limit: Int,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        guard let queryEmbedding = embedding as? [Float] else { reject("INVALID_INPUT", "Invalid embedding", nil); return }
        do {
            let query = try box.query { VectorEntity.embedding.nearest(query: queryEmbedding, limit: limit) }.build()
            let results = try query.find()
            let resultArray: [[String: Any]] = results.map { entity in
                ["id": Int(entity.id), "metadata": entity.metadata ?? "", "workspaceSlug": entity.workspaceSlug ?? ""]
            }
            resolve(resultArray)
        } catch {
            reject("SEARCH_ERROR", error.localizedDescription, error)
        }
    }

    @objc func delete(_ id: Int, resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        do { try box.remove(Id(id)); resolve(true) }
        catch { reject("DELETE_ERROR", error.localizedDescription, error) }
    }

    @objc func deleteByWorkspace(_ workspaceSlug: String,
                                 resolver resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        do {
            let query = try box.query { VectorEntity.workspaceSlug.equal(workspaceSlug) }.build()
            let ids = try query.findIds()
            try box.remove(ids)
            resolve(true)
        } catch {
            reject("DELETE_ERROR", error.localizedDescription, error)
        }
    }
}
