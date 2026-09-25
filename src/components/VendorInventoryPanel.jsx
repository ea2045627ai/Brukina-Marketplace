          <label>Description
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Provide context about your product (e.g. materials, expiration details, wholesale packs)..."
              rows={4}
            />
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Listing Product...' : 'Publish Product'}
          </button>
        </form>
      </div>
    </div>
  );
}
